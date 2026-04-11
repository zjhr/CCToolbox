param(
  [ValidateSet('install', 'test', 'start', 'stop', 'status', 'menu', 'dev-server', 'web-install', 'web-dev', 'web-build', 'all', 'help')]
  [string]$Task = 'help'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:NpmRunner = $null

function Get-NpmRunner {
  if ($script:NpmRunner) {
    return $script:NpmRunner
  }

  $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
  if ($npmCmd) {
    try {
      & $npmCmd.Source '--version' *> $null
      $exitCode = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 0 }
      if ($exitCode -eq 0) {
        $script:NpmRunner = @{
          mode = 'npm'
          command = $npmCmd.Source
        }
        return $script:NpmRunner
      }
    } catch {
      # Fallback to node + npm-cli when npm command is present but broken.
    }
  }

  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
  if ($nodeCmd) {
    $nodeDir = Split-Path -Parent $nodeCmd.Source
    $npmCli = Join-Path $nodeDir 'node_modules\npm\bin\npm-cli.js'
    if (Test-Path $npmCli) {
      $script:NpmRunner = @{
        mode = 'node+npm-cli'
        node = $nodeCmd.Source
        npmCli = $npmCli
      }
      return $script:NpmRunner
    }
  }

  $voltaNode = Join-Path $env:LOCALAPPDATA 'Volta\tools\image\node\24.14.1\node.exe'
  $voltaNpmCli = Join-Path $env:LOCALAPPDATA 'Volta\tools\image\node\24.14.1\node_modules\npm\bin\npm-cli.js'
  if ((Test-Path $voltaNode) -and (Test-Path $voltaNpmCli)) {
    $script:NpmRunner = @{
      mode = 'node+npm-cli'
      node = $voltaNode
      npmCli = $voltaNpmCli
    }
    return $script:NpmRunner
  }

  throw 'No npm runner found. Install Node.js/npm or check Volta Node installation.'
}

function Invoke-Npm {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Args,
    [string]$WorkingDirectory = (Get-Location).Path
  )

  $runner = Get-NpmRunner
  Push-Location $WorkingDirectory
  try {
    if ($runner.mode -eq 'npm') {
      & $runner.command @Args
    } else {
      & $runner.node $runner.npmCli @Args
    }

    $exitCode = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 0 }
    if ($exitCode -ne 0) {
      throw "Command failed: npm $($Args -join ' ') (exit=$exitCode)"
    }
  } finally {
    Pop-Location
  }
}

function Get-NodeCommand {
  $runner = Get-NpmRunner
  if ($runner.mode -eq 'node+npm-cli') {
    return $runner.node
  }

  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
  if ($nodeCmd) {
    return $nodeCmd.Source
  }

  throw 'Node.js command not found.'
}

function Invoke-Ct {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Args
  )

  if (-not $env:CCTOOLBOX_ENABLE_ENV_AUTOSYNC) {
    $env:CCTOOLBOX_DISABLE_ENV_AUTOSYNC = '1'
  }

  $node = Get-NodeCommand
  & $node 'bin/ct.js' @Args
  $exitCode = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 0 }
  if ($exitCode -ne 0) {
    throw "Command failed: node bin/ct.js $($Args -join ' ') (exit=$exitCode)"
  }
}

function Get-WebUiPort {
  $node = Get-NodeCommand
  $portOutput = & $node '-e' "const {loadConfig}=require('./src/config/loader'); const port=(loadConfig().ports||{}).webUI||10099; process.stdout.write(String(port));"
  $exitCode = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 0 }
  if ($exitCode -ne 0) {
    return 10099
  }

  $portText = [string]$portOutput
  $port = 0
  if ([int]::TryParse($portText, [ref]$port) -and $port -gt 0) {
    return $port
  }
  return 10099
}

function Test-WebUiHealth {
  param(
    [int]$Port
  )

  $url = "http://127.0.0.1:$Port/health"
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 4
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Ensure-WebBuild {
  $webDist = Join-Path (Get-Location).Path 'dist\web\index.html'
  if (Test-Path $webDist) {
    return
  }

  Write-Host '[Start] dist/web not found, building web assets first...'
  $webNodeModules = Join-Path (Get-Location).Path 'src\web\node_modules'
  if (-not (Test-Path $webNodeModules)) {
    Invoke-Npm -Args @('install') -WorkingDirectory (Join-Path (Get-Location).Path 'src\web')
  }
  Invoke-Npm -Args @('run', 'build:web')
}

function Show-Help {
  Write-Host ''
  Write-Host 'CCToolbox run helper script'
  Write-Host ''
  Write-Host 'Usage:'
  Write-Host '  .\run.ps1 -Task install'
  Write-Host '  .\run.ps1 -Task test'
  Write-Host '  .\run.ps1 -Task start      # start Web UI service in background'
  Write-Host '  .\run.ps1 -Task status     # show service status'
  Write-Host '  .\run.ps1 -Task stop       # stop service'
  Write-Host '  .\run.ps1 -Task menu       # open interactive menu (npm start)'
  Write-Host '  .\run.ps1 -Task dev-server'
  Write-Host '  .\run.ps1 -Task web-install'
  Write-Host '  .\run.ps1 -Task web-dev'
  Write-Host '  .\run.ps1 -Task web-build'
  Write-Host '  .\run.ps1 -Task all'
  Write-Host ''
  Write-Host 'Notes:'
  Write-Host '  all = install + test'
  Write-Host ''
}

$runnerInfo = Get-NpmRunner
if ($runnerInfo.mode -eq 'npm') {
  Write-Host "[Runner] using npm: $($runnerInfo.command)"
} else {
  Write-Host "[Runner] using node + npm-cli: $($runnerInfo.node) $($runnerInfo.npmCli)"
}

switch ($Task) {
  'install' {
    Invoke-Npm -Args @('install')
  }
  'test' {
    Invoke-Npm -Args @('test')
  }
  'start' {
    Ensure-WebBuild
    Invoke-Ct -Args @('start')
    Start-Sleep -Seconds 2
    $port = Get-WebUiPort
    if (-not (Test-WebUiHealth -Port $port)) {
      Write-Warning "Web UI health check failed on port $port."
      $errorLog = Join-Path $HOME '.claude\logs\cctoolbox-error.log'
      if (Test-Path $errorLog) {
        Write-Host ''
        Write-Host '[Last error logs]'
        Get-Content $errorLog -Tail 12
      }
      Write-Host ''
      Write-Host "Try: .\run.ps1 -Task status"
      Write-Host "If error contains EACCES/EADDRINUSE, switch port in config or run terminal as Administrator."
    }
  }
  'stop' {
    Invoke-Ct -Args @('stop')
  }
  'status' {
    Invoke-Ct -Args @('status')
  }
  'menu' {
    Invoke-Npm -Args @('start')
  }
  'dev-server' {
    Invoke-Npm -Args @('run', 'dev:server')
  }
  'web-install' {
    Invoke-Npm -Args @('install') -WorkingDirectory (Join-Path (Get-Location).Path 'src\web')
  }
  'web-dev' {
    Invoke-Npm -Args @('run', 'dev:web') -WorkingDirectory (Join-Path (Get-Location).Path 'src\web')
  }
  'web-build' {
    Invoke-Npm -Args @('run', 'build:web')
  }
  'all' {
    Invoke-Npm -Args @('install')
    Invoke-Npm -Args @('test')
  }
  default {
    Show-Help
  }
}
