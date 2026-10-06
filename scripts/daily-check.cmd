@echo off
REM Maroo daily check — safe without login (login-needed steps will print fix)
echo === m-aws status ===
cmd /c m-aws status
echo.
echo === m-aws doctor ===
cmd /c m-aws doctor
echo.
echo === maroo-mcp doctor ===
cmd /c maroo-mcp doctor
echo.
echo NEXT after login:
echo   cmd /c m-aws drip
echo   then agent.create -^> agent.fund -^> policy.set -^> transfer.send
