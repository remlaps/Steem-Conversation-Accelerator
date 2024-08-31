# Steem Conversation Accelerator

## Overview

The Steem Conversation Accelerator is a browser extension that is intended to enhance our experience on the Steem platform by sending notifications in the browser when activities of interest occur on the Steem blockchain.  When the notification is clicked, a browser tab is launched with a list of the recently observed activities.

If the browser goes idle and stays that way for 10 minutes, background polling will stop until the browser becomes active again.

## Usage

To use this browser extension, simply install it by following the instructions below.  A script will run in the background and a browser notification will be displayed when some tracked activity is observed.  The frequency of the background script and the name of the observer account are controlled by settings in the browser's popup window.  This window is opened at installation time and can also be opened later from the browser's extension menu.

If you click on the browser notification, it will open a new tab in the browser with a list of the observed activities.

The activity page will have a white background while it's loading and will change color to light blue when loading completes.  If the page is closed before it finishes loading, the same acitivities will be displayed again later (unless they age out).

Please note that:
1. There will be duplicates.  If the observer follows two accounts which comment on each other's posts, the comment from one account may also show up as a reply from the other account's perspective.  Some of these are filtered out, but others will appear as a consequence of staggered polling between accounts.
2. There will be missed activities.  The intention here is to show recent activities, so if your browser is idle or closed for a period of time, older activities will be intentionally skipped.  Additionally, network/API disruptions can lead to missed activities.  Edits of posts, comments, and replies are also filtered out.

Changing API and web server preferences can also be done in the popup window.  If you change your API or web server preferences, the update will be recognized after the current polling cycle finishes, so depending on the number of followed accounts, the speed of the network, and the polling interval, there may be a significant lag time.

As of now, the API endpoints include the following:

- https://api.moecki.online (@moecki on Steem)
- https://api.steememory.com (@yasu on Steem)
- https://api.steemit.com (@steemitblog on Steem)
- https://api.steemitdev.com (@steemitblog on Steem)

To add other API endpoints, the "follow" plugin must be active.

Current web servers include:

- https://steemit.com
- https://steemitdev.com
- https://steempro.com
- https://upvu.org

## Monitored activities
### In progress / active
- [x] Notification of posts, comments, and replies for accounts that are followed by the observer account.

### TODO
- [ ] Notification of activity on threads that the observer account has participated in.
- [ ] Notifications of activity in communities that the observer account subscribes to.
- [ ] Visibility (without notifications) for posts that are supported by token-burning/post-promotion activities.

## Files

The code organization is a work in progress, but this is the intended purpose of the files:

- **manifest.json**: Manifest V3 configuration
- **popup.html**, **popup.js**: Pop-up window for entering configuation settings (i.e. polling interval, observer account, api endpoint, and web server)
- **activityList.html**, **activitityList.js**: HTML/JavaScript/CSS web page with details of new activity on the Steem blockchain.
- **background.js**: polling for Steem blockchain activity and delivering browser notifications when activity occurs.
- **commonUtils.js**: Generic helper functions that can be used in background.js or activityList.html
- **localStorageUtils.js**: Helper functions for interacting with browser storage, including locking mechanisms.
- **steemHelpers.js**: Helper functions for interacting with the Steem blockchain.

## Installation

The extension has been developed with use of the [Brave](https://brave.com) browser, and might also work with other browsers that support Manifest V3.

The extension can be installed in Developer mode.  Here are AI-generated, untested installation instructions:

### Brave

1. Download the extension source code from the [GitHub repository](https://github.com/remlaps/Steem-Conversation-Accelerator).
2. Open the Brave browser and navigate to `brave://extensions/`.
3. Enable "Developer mode" by toggling the switch in the top right corner.
4. Click the "Load unpacked" button and select the directory containing the extension source code.
5. The Steem Conversation Accelerator extension should now be installed and active in your Brave browser.
6. Disable "Developer mode" by toggling the switch in the top right corner.

### Microsoft Edge

1. Download the extension source code from the [GitHub repository](https://github.com/remlaps/Steem-Conversation-Accelerator).
2. Open the Microsoft Edge browser and navigate to `edge://extensions/`.
3. Enable "Developer mode" by toggling the switch in the left-hand sidebar.
4. Click the "Load unpacked" button and select the directory containing the extension source code.
5. The Steem Conversation Accelerator extension should now be installed and active in your Microsoft Edge browser.
6. Disable "Developer mode" by toggling the switch in the left-hand sidebar.

### Google Chrome

1. Download the extension source code from the [GitHub repository](https://github.com/remlaps/Steem-Conversation-Accelerator).
2. Open the Google Chrome browser and navigate to `chrome://extensions/`.
3. Enable "Developer mode" by toggling the switch in the top right corner.
4. Click the "Load unpacked" button and select the directory containing the extension source code.
5. The Steem Conversation Accelerator extension should now be installed and active in your Google Chrome browser.
6. Disable "Developer mode" by toggling the switch in the top right corner.

### Startup
- After installing and starting the browser extension, you should receive a popup window asking for configuration information.  Set the observer account and change any other desired settings.

## Contributing

Thank you for your interest in contributing to the Steem Conversation Accelerator! This is a free and open-source project, and contributions are welcome from developers of all skill levels.

### Getting Started

1. Fork the repository on GitHub to create a copy of the codebase.
2. Clone the forked repository to your local machine using `git clone`.

### Contributing Code

1. Create a new branch for your feature or bug fix using `git checkout -b <branch-name>`.
2. Make your changes and commit them using `git add` and `git commit`.
3. Push your changes to your forked repository using `git push origin <branch-name>`.

### Submitting a Pull Request

1. Go to your forked repository on GitHub and click the "New pull request" button.
2. Fill in the required information, including a brief description of your changes.
3. Submit the pull request for review.

### Code Style and Guidelines

- TODO

### Issues and Bugs

If you encounter any issues or bugs while contributing, please open a new issue on the GitHub repository.

## References
- (July 4, 2024): [Programming Diary #20: Accelerating organic activity](https://steemit.com/hive-151113/@remlaps/programming-diary-20-accelerating-organic)
- (July 21, 2024): [Programming Diary #21: Entertainment and collaboration](https://steemit.com/hive-151113/@remlaps/programming-diary-21-entertainment-and)
- (August 3, 2024): [Programming Diary #22: Boosting organic conversations and reflecting on support for open source development.](https://steemit.com/hive-151113/@remlaps/programming-diary-22-boosting-organic)
- (August 17, 2204): [Programming Diary #23: Warning - this tool exercises your voting power](https://steemit.com/hive-151113/@remlaps/programming-diary-23-warning-this)


## Contact Information

If you have any questions or need assistance with the Steem Conversation Accelerator, please feel free to reach out to me, @remlaps, on the Steem blockchain.

## Managing Expectations

I believe this can be a useful tool for many participants in the Steem ecosystems, but be forewarned that it will have problems and fixes will be slow.  I am learning JavaScript, HTML, and CSS as I go here; and this is a hobby project that I can only develop in whatever spare time I find during nights and weekends.

Additionally, for the above reasons, I am sticking to a view-only perspective, and I don't expect to incorporate anything involving the use of blockchain keys any time soon.  If this extension ever asks for your keys, you should be suspicious.

## Disclaimer

This extension is provided "as is" without warranty of any kind, either express or implied, including, but not limited to, the implied warranties of merchantability and fitness for a particular purpose. The entire risk as to the quality and performance of the extension is with you. Should the extension prove defective, you assume the cost of all necessary servicing, repair, or correction.

In no event shall the authors or copyright holders be liable for any claim, damages, or other liability, whether in an action of contract, tort, or otherwise, arising from, out of, or in connection with the extension or the use or other dealings in the extension.