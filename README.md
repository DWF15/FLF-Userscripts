# FLF Userscripts

## Mail to Clio

[Install or update Mail to Clio](https://raw.githubusercontent.com/DWF15/FLF-Userscripts/main/mail-to-clio.user.js)

Current userscript version: **1.2.3**. Includes the Gmail review badges introduced in version 1.2.0. Grouped ticket matching also requires hosted app version 1.4.0 or later.

### Install once

1. Enable the Tampermonkey browser extension.
2. Open the install link above. Tampermonkey should offer Install or Update/Reinstall. Keep only one enabled copy of this script.
3. If the browser displays plain code instead, replace the contents of the existing Mail to Clio script in Tampermonkey with that code and save.
4. Refresh Gmail. The Mail to Clio note should show 1.2.3.
5. Open one notification and click Review for Clio.

New installations default to the firm's hosted review app. Existing installations retain their saved review URL and keywords because the script name, namespace and storage keys are unchanged.

### Move the review button

Drag the small **Move** handle beside Review for Clio to reposition the panel. Its location is saved in this browser profile and restored after refresh. The panel is kept inside the window when resized. Clicking Review for Clio still opens the review normally.

For keyboard positioning, focus the Move handle and use the arrow keys (Shift moves farther). Escape cancels an active drag. Tampermonkey's **Mail to Clio: Reset button position** menu command restores the bottom-right default.

### Future updates

The script's @updateURL and @downloadURL both point to the raw file on this repository's main branch. Keep script updates enabled in Tampermonkey. Its normal update checks can pick up newer versions; updates are not instantaneous. You can also use Tampermonkey's update-check command.

To publish a release, update mail-to-clio.user.js on main, increase @version, and update the visible version note and this README. Keep the name, namespace and update addresses stable. Test changes before publishing: installed staff copies can receive updates from this repository.

This updates only the Gmail userscript. Backend app changes still require deployment through the existing app repository and Railway.

### Gmail badges

Opened for review means a review window was opened. Clio update verified means the app confirmed a live field or calendar action; it does not imply that every action or client email is complete. Badges persist in the same browser/Tampermonkey profile, are not shared Gmail labels, and store a body hash, status and timestamp rather than the email text.

This public repository contains only browser script code and instructions. Keep credentials, OAuth tokens, client messages, databases and private backend files out of this repository.
