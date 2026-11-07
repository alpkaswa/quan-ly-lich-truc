Option Explicit
Dim shell, command
Set shell = CreateObject("WScript.Shell")
command = """" & WScript.Arguments(0) & """ """ & WScript.Arguments(1) & """"
WScript.Quit shell.Run(command, 0, True)
