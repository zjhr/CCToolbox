#!/usr/bin/env python3
import argparse
import json
import os
import pickle
import sys
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser(description='Parse Serena document_symbols.pkl')
    parser.add_argument('--project', required=True, help='Project root path')
    return parser.parse_args()


class PlaceholderObject:
    def __init__(self, *args, **kwargs):
        pass

    def __setstate__(self, state):
        if isinstance(state, dict):
            self.__dict__.update(state)
        else:
            self.state = state


class SafeUnpickler(pickle.Unpickler):
    def find_class(self, module, name):
        try:
            return super().find_class(module, name)
        except Exception:
            return PlaceholderObject


def find_pkl(project_path):
    cache_dir = os.path.join(project_path, '.serena', 'cache')
    if not os.path.isdir(cache_dir):
        return None
    candidates = []
    for root, _dirs, files in os.walk(cache_dir):
        if 'document_symbols.pkl' in files:
            file_path = os.path.join(root, 'document_symbols.pkl')
            try:
                mtime = os.path.getmtime(file_path)
            except OSError:
                mtime = 0
            candidates.append((mtime, file_path))
    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0], reverse=True)
    return candidates[0][1]


def safe_str(value):
    try:
        return str(value)
    except Exception:
        return repr(value)


def normalize_position(pos):
    if pos is None:
        return None
    if isinstance(pos, dict):
        line = pos.get('line') or pos.get('lineno') or pos.get('row')
        character = pos.get('character') or pos.get('col') or pos.get('column')
        return {'line': int(line) if line is not None else 0, 'character': int(character) if character is not None else 0}
    if hasattr(pos, 'line') or hasattr(pos, 'character'):
        line = getattr(pos, 'line', 0)
        character = getattr(pos, 'character', 0)
        return {'line': int(line), 'character': int(character)}
    if hasattr(pos, 'lineno'):
        return {'line': int(getattr(pos, 'lineno', 0)), 'character': int(getattr(pos, 'col_offset', 0))}
    return None


def normalize_range(rng):
    if rng is None:
        return None
    if isinstance(rng, dict):
        return {
            'start': normalize_position(rng.get('start')),
            'end': normalize_position(rng.get('end'))
        }
    if hasattr(rng, 'start') and hasattr(rng, 'end'):
        return {
            'start': normalize_position(getattr(rng, 'start')),
            'end': normalize_position(getattr(rng, 'end'))
        }
    return None


def normalize_symbol(symbol):
    if symbol is None:
        return None

    def pick(obj, keys):
        if isinstance(obj, dict):
            for key in keys:
                if key in obj:
                    return obj.get(key)
        for key in keys:
            if hasattr(obj, key):
                return getattr(obj, key)
        return None

    name = pick(symbol, ['name', 'symbol_name', 'identifier'])
    kind = pick(symbol, ['kind', 'symbol_kind'])
    detail = pick(symbol, ['detail', 'signature'])
    children = pick(symbol, ['children', 'child_symbols'])
    symbol_range = pick(symbol, ['range'])
    selection_range = pick(symbol, ['selection_range', 'selectionRange'])

    try:
        kind_value = int(kind) if kind is not None else None
    except (TypeError, ValueError):
        kind_value = kind

    normalized = {
        'name': safe_str(name) if name is not None else '未知符号',
        'kind': kind_value,
        'detail': safe_str(detail) if detail is not None else '',
        'range': normalize_range(symbol_range),
        'selectionRange': normalize_range(selection_range),
        'children': []
    }

    if children:
        for child in children:
            child_normalized = normalize_symbol(child)
            if child_normalized:
                normalized['children'].append(child_normalized)

    return normalized


def normalize_symbols(value):
    if value is None:
        return []
    if isinstance(value, list):
        result = []
        for item in value:
            normalized = normalize_symbol(item)
            if normalized:
                result.append(normalized)
        return result
    single = normalize_symbol(value)
    return [single] if single else []


def extract_symbol_container(value):
    if value is None:
        return None
    if isinstance(value, (tuple, list)):
        for item in value:
            if hasattr(item, 'root_symbols') or hasattr(item, 'symbols'):
                return item
        for item in value:
            if not isinstance(item, (str, bytes)):
                return item
        return value[-1] if value else None
    return value


def extract_symbols(value):
    container = extract_symbol_container(value)
    if container is None:
        return []
    if isinstance(container, dict):
        for key in ['root_symbols', 'symbols', 'items', 'data']:
            if key in container:
                return normalize_symbols(container[key])
        return normalize_symbols(container)
    for attr in ['root_symbols', 'symbols', 'items', 'data']:
        if hasattr(container, attr):
            return normalize_symbols(getattr(container, attr))
    return normalize_symbols(container)


def build_tree(paths):
    root = {}

    for file_path in paths:
        segments = [segment for segment in file_path.split('/') if segment]
        current = root
        current_path = ''
        for index, segment in enumerate(segments):
            current_path = f"{current_path}/{segment}".lstrip('/')
            node = current.setdefault(segment, {
                'name': segment,
                'path': current_path,
                'type': 'file' if index == len(segments) - 1 else 'directory',
                'children': {}
            })
            current = node['children']

    def to_list(node_map):
        nodes = []
        for node in node_map.values():
            if node['type'] == 'directory':
                children = to_list(node['children'])
                nodes.append({
                    'name': node['name'],
                    'path': node['path'],
                    'type': 'directory',
                    'children': children
                })
            else:
                nodes.append({
                    'name': node['name'],
                    'path': node['path'],
                    'type': 'file'
                })
        nodes.sort(key=lambda item: (0 if item['type'] == 'directory' else 1, item['name']))
        return nodes

    return to_list(root)


def main():
    args = parse_args()
    project_path = os.path.abspath(args.project)

    pkl_path = find_pkl(project_path)
    if not pkl_path:
        output = {'files': [], 'symbols': {}, 'fileCount': 0}
        print(json.dumps(output, ensure_ascii=False))
        return

    try:
        with open(pkl_path, 'rb') as handle:
            data = SafeUnpickler(handle).load()
    except Exception as exc:
        output = {'files': [], 'symbols': {}, 'fileCount': 0, 'error': safe_str(exc)}
        print(json.dumps(output, ensure_ascii=False))
        return

    symbols_map = {}
    if isinstance(data, dict) and 'obj' in data and isinstance(data.get('obj'), dict):
        data = data.get('obj')

    if isinstance(data, dict):
        for key, value in data.items():
            if key == '__cache_version':
                continue
            file_path = safe_str(key)
            try:
                rel_path = os.path.relpath(file_path, project_path)
            except ValueError:
                rel_path = file_path
            rel_path = rel_path.replace('\\', '/')
            if rel_path.startswith('..'):
                rel_path = file_path.replace('\\', '/')
            symbols_map[rel_path] = extract_symbols(value)

    files = build_tree(list(symbols_map.keys()))
    output = {
        'files': files,
        'symbols': symbols_map,
        'fileCount': len(symbols_map)
    }
    print(json.dumps(output, ensure_ascii=False))


if __name__ == '__main__':
    main()
