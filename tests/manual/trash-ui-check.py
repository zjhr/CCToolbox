import json
import os
import time
from datetime import datetime, timedelta
from pathlib import Path

from playwright.sync_api import sync_playwright, expect


def write_jsonl(file_path, records):
    content = '\n'.join(json.dumps(record, ensure_ascii=False) for record in records) + '\n'
    file_path.write_text(content, encoding='utf-8')


def write_claude_session(project_dir, session_id, user_text, assistant_text, mtime=None):
    now = datetime.utcnow().isoformat() + 'Z'
    records = [
        {
            'type': 'user',
            'timestamp': now,
            'message': {'content': user_text}
        },
        {
            'type': 'assistant',
            'timestamp': now,
            'message': {'content': assistant_text}
        }
    ]
    session_path = project_dir / f'{session_id}.jsonl'
    write_jsonl(session_path, records)
    if mtime is not None:
        os.utime(session_path, (mtime, mtime))


def write_codex_session(codex_dir, session_id, cwd, user_text):
    codex_dir.mkdir(parents=True, exist_ok=True)
    meta = {
        'type': 'session_meta',
        'payload': {
            'id': session_id,
            'timestamp': '2025-01-01T00:00:00Z',
            'cwd': cwd
        }
    }
    msg = {
        'type': 'response_item',
        'timestamp': '2025-01-01T00:00:10Z',
        'payload': {
            'type': 'message',
            'role': 'user',
            'content': [{'text': user_text}]
        }
    }
    path = codex_dir / f'rollout-2025-01-01T00-00-00-{session_id}.jsonl'
    write_jsonl(path, [meta, msg])


def write_gemini_session(gemini_dir, project_hash, session_id, user_text):
    gemini_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        'sessionId': session_id,
        'projectHash': project_hash,
        'startTime': datetime.utcnow().isoformat() + 'Z',
        'lastUpdated': datetime.utcnow().isoformat() + 'Z',
        'messages': [
            {'type': 'user', 'content': user_text},
            {'type': 'model', 'content': 'hello from gemini'}
        ]
    }
    path = gemini_dir / 'session-2025-01-01T00-00-00-abcd.json'
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')


def seed_data():
    home = Path(os.environ.get('HOME', ''))
    if not home:
        raise RuntimeError('HOME is not set')

    claude_project = 'demo-project'
    claude_dir = home / '.claude' / 'projects' / claude_project
    claude_dir.mkdir(parents=True, exist_ok=True)

    for i in range(1, 111):
        session_id = f'session-{i:03d}'
        write_claude_session(
            claude_dir,
            session_id,
            f'hello {session_id}',
            f'reply {session_id}'
        )

    old_session_id = 'session-old'
    old_mtime = (datetime.utcnow() - timedelta(days=40)).timestamp()
    write_claude_session(
        claude_dir,
        old_session_id,
        'hello old session',
        'reply old session',
        mtime=old_mtime
    )

    codex_project = 'codex-demo'
    codex_dir = home / '.codex' / 'sessions' / '2025' / '01' / '01'
    write_codex_session(codex_dir, 'codex-1', f'/tmp/{codex_project}', 'hello codex')

    gemini_project = 'b' * 64
    gemini_dir = home / '.gemini' / 'tmp' / gemini_project / 'chats'
    write_gemini_session(gemini_dir, gemini_project, 'gemini-1', 'hello gemini')

    return claude_project, codex_project, gemini_project, old_session_id


def open_clear_menu(page):
    page.get_by_role('button', name='清除历史').click()


def select_clear_menu(page, label):
    open_clear_menu(page)
    page.get_by_text(label, exact=True).click()


def get_sticky_info(page):
    return page.evaluate("""() => {
        const content = document.querySelector('.content');
        const bar = document.querySelector('.selection-bar');
        const contentRect = content.getBoundingClientRect();
        const barRect = bar.getBoundingClientRect();
        const barStyle = getComputedStyle(bar);
        const contentStyle = getComputedStyle(content);
        const beforeStyle = getComputedStyle(bar, '::before');
        return {
            contentTop: contentRect.top,
            barTop: barRect.top,
            barPosition: barStyle.position,
            contentPaddingTop: contentStyle.paddingTop,
            beforeTop: beforeStyle.top
        };
    }""")


def assert_sticky(page):
    info = get_sticky_info(page)
    expected_top = info['contentTop'] + 8
    if info['barPosition'] != 'sticky':
        raise AssertionError('selection-bar 非 sticky 定位')
    if info['contentPaddingTop'] != '0px':
        raise AssertionError('content padding-top 未为 0')
    if info['beforeTop'] != '-9px':
        raise AssertionError('selection-bar::before top 非 -9px')
    if abs(info['barTop'] - expected_top) > 2:
        raise AssertionError('selection-bar 顶部偏移异常')

    page.evaluate("document.querySelector('.content').scrollTop = 800")
    time.sleep(0.3)
    info_after = get_sticky_info(page)
    expected_top_after = info_after['contentTop'] + 8
    if abs(info_after['barTop'] - expected_top_after) > 2:
        raise AssertionError('selection-bar 滚动后未保持顶部')


def wait_for_sessions(page):
    page.wait_for_selector('.session-item')
    count = page.locator('.session-item').count()
    if count == 0:
        raise AssertionError('会话列表为空')


def select_session_by_id(page, session_id):
    target = page.locator('.session-item', has_text=session_id).first.locator('.n-checkbox')
    target.click()


def delete_selected(page):
    page.get_by_role('button', name='删除选中 (1)').click()
    page.get_by_role('button', name='确定删除').click()


def open_trash(page):
    open_clear_menu(page)
    page.locator('.n-dropdown-option').filter(has_text='回收站').first.click()


def test_claude(page, project_name, old_session_id):
    page.goto(f'http://localhost:5000/#/claude/sessions/{project_name}')
    page.wait_for_load_state('networkidle')
    wait_for_sessions(page)

    select_clear_menu(page, '选择模式')
    page.wait_for_selector('.selection-bar')
    wait_for_sessions(page)
    assert_sticky(page)

    select_session_by_id(page, 'session-001')
    delete_selected(page)

    open_clear_menu(page)
    trash_label = page.locator('.n-dropdown-option').filter(has_text='回收站').first.text_content()
    if '(' not in trash_label:
        raise AssertionError('回收站数量未显示')
    page.keyboard.press('Escape')

    open_trash(page)
    expect(page.get_by_text('回收站', exact=True)).to_be_visible()
    page.get_by_text('查看详情', exact=True).first.click()

    expect(page.locator('.chat-message')).to_be_visible()
    expect(page.get_by_text('hello session-001')).to_be_visible()
    page.locator('.close-btn').click()
    page.keyboard.press('Escape')

    select_clear_menu(page, '清理30天前')
    expect(page.get_by_text('删除确认', exact=True)).to_be_visible()
    expect(page.get_by_text(old_session_id, exact=False)).to_be_visible()
    page.get_by_role('button', name='取消').click()

    open_trash(page)
    page.get_by_text('恢复', exact=True).first.click()
    page.keyboard.press('Escape')


def test_codex(page, project_name):
    page.goto(f'http://localhost:5000/#/codex/sessions/{project_name}')
    page.wait_for_load_state('networkidle')
    wait_for_sessions(page)
    select_clear_menu(page, '选择模式')
    page.wait_for_selector('.selection-bar')
    select_session_by_id(page, 'codex-1')
    delete_selected(page)
    open_trash(page)
    expect(page.get_by_text('回收站', exact=True)).to_be_visible()
    page.get_by_text('恢复', exact=True).first.click()
    page.keyboard.press('Escape')


def test_gemini(page, project_hash):
    page.goto(f'http://localhost:5000/#/gemini/sessions/{project_hash}')
    page.wait_for_load_state('networkidle')
    wait_for_sessions(page)
    select_clear_menu(page, '选择模式')
    page.wait_for_selector('.selection-bar')
    select_session_by_id(page, 'gemini-1')
    delete_selected(page)
    open_trash(page)
    expect(page.get_by_text('回收站', exact=True)).to_be_visible()
    page.get_by_text('恢复', exact=True).first.click()
    page.keyboard.press('Escape')


def main():
    claude_project, codex_project, gemini_project, old_session_id = seed_data()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_viewport_size({'width': 1400, 'height': 900})
        page.set_default_timeout(15000)

        test_claude(page, claude_project, old_session_id)
        test_codex(page, codex_project)
        test_gemini(page, gemini_project)

        browser.close()

    print('UI verification completed')


if __name__ == '__main__':
    main()
