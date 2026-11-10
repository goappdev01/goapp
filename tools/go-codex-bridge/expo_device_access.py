"""Read the one explicitly approved Windows rule. Never changes firewall policy."""
import ipaddress
import json
import os
import subprocess

RULE='GO Expo comprobaciones 8089 - iPhone Tailscale privado'
SCRIPT=r'''
$ErrorActionPreference='Stop'
try {
 $p=New-Object -ComObject HNetCfg.FwPolicy2; $r=$p.Rules.Item($env:GO_EXPO_RULE)
 $peer=$env:GO_EXPO_PEER; $local=$env:GO_EXPO_LOCAL
 $private=(Get-NetConnectionProfile -InterfaceAlias Tailscale -ErrorAction Stop).NetworkCategory -eq 'Private'
 $allowed=$private -and $r.Enabled -and $r.Direction -eq 1 -and $r.Action -eq 1 -and $r.Protocol -eq 6 -and $r.LocalPorts -eq '8089' -and $r.Profiles -eq 2 -and $r.ApplicationName -eq $env:GO_EXPO_NODE -and ($r.RemoteAddresses -eq $peer -or $r.RemoteAddresses -eq ($peer+'/255.255.255.255')) -and ($r.LocalAddresses -eq $local -or $r.LocalAddresses -eq ($local+'/255.255.255.255'))
 @{allowed=[bool]$allowed;rule=$env:GO_EXPO_RULE} | ConvertTo-Json -Compress
} catch { @{allowed=$false;reason='La regla limitada del iPhone no está disponible.'} | ConvertTo-Json -Compress }
'''


def check(local,peer,node):
    if not peer:return {'allowed':False,'reason':'Falta configurar el iPhone autorizado para este entorno.'}
    try:
        for address in (local,peer):
            if ipaddress.ip_address(address) not in ipaddress.ip_network('100.64.0.0/10'):raise ValueError('Not a tailnet address')
        env=os.environ.copy()
        env.update(GO_EXPO_LOCAL=local,GO_EXPO_PEER=peer,GO_EXPO_NODE=node,GO_EXPO_RULE=RULE)
        result=subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-Command',SCRIPT],
                              env=env,capture_output=True,text=True,encoding='utf-8',errors='replace',
                              timeout=8,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        data=json.loads(result.stdout)
        if result.returncode or type(data.get('allowed')) is not bool:raise ValueError('Unknown firewall result')
        if not data['allowed']:data['reason']='Windows no confirma la regla limitada que permite al iPhone entrar por 8089.'
        return data
    except (OSError,ValueError,subprocess.SubprocessError):
        return {'allowed':False,'reason':'No se pudo comprobar el permiso de Windows. Esto no equivale a conectividad desde iPhone.'}
