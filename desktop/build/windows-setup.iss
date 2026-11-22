[Setup]
AppId=local.focusjournal.desktop
AppName=专注记
AppVersion={#AppVersion}
AppPublisher=Focus Journal
DefaultDirName={localappdata}\Programs\FocusJournal
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutputPath}
OutputBaseFilename=FocusJournal-{#AppVersion}-Windows-x64-Setup
Compression=lzma2/fast
SolidCompression=yes
UninstallDisplayIcon={app}\专注记.exe
WizardStyle=modern
CloseApplications=no
RestartApplications=no
DisableProgramGroupPage=yes

[Files]
Source: "{#PackagePath}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{userprograms}\专注记"; Filename: "{app}\专注记.exe"; AppUserModelID: "local.focusjournal.desktop"

[Run]
Filename: "{app}\专注记.exe"; Description: "启动专注记"; Flags: nowait postinstall; Check: ShouldLaunch

[Code]
function OpenProcess(Access: LongWord; Inherit: Boolean; Pid: LongWord): THandle;
  external 'OpenProcess@kernel32.dll stdcall';
function WaitForSingleObject(Handle: THandle; Timeout: LongWord): LongWord;
  external 'WaitForSingleObject@kernel32.dll stdcall';
function CloseHandle(Handle: THandle): Boolean;
  external 'CloseHandle@kernel32.dll stdcall';

function ShouldLaunch(): Boolean;
begin
  Result := ExpandConstant('{param:FocusNoLaunch|0}') <> '1';
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var ParentId: Integer; Handle: THandle;
begin
  Result := '';
  ParentId := StrToIntDef(ExpandConstant('{param:FocusParent|0}'), 0);
  if ParentId <= 0 then Exit;
  Handle := OpenProcess($00100000, False, ParentId);
  if Handle = 0 then begin
    if DLLGetLastError <> 87 then Result := '无法确认旧版已退出。请关闭专注记后重新安装。';
    Exit;
  end;
  try
    if WaitForSingleObject(Handle, 30000) <> 0 then
      Result := '工作区仍在使用。请保存并退出专注记，再重试安装。';
  finally
    CloseHandle(Handle);
  end;
end;
