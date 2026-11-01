/** Windows CommandLineToArgvW quoting, transported as data rather than shell text. */
export function windowsCommandLine(args:string[]){return args.map(arg=>'"'+arg.replace(/(\\*)"/g,'$1$1\\"').replace(/(\\+)$/,'$1$1')+'"').join(' ');}
export function outsideLaunchScript(executable:string,args:string[],cwd:string){
 const payload=Buffer.from(JSON.stringify({command:windowsCommandLine([executable,...args]),cwd}),'utf8').toString('base64');
 return `$ErrorActionPreference='Stop'\n$request=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}'))|ConvertFrom-Json\n$startup=New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ShowWindow=[uint16]0}\n$result=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine=$request.command;CurrentDirectory=$request.cwd;ProcessStartupInformation=$startup}\nif($result.ReturnValue -ne 0){throw 'Independent workspace startup failed'}\n`;
}
