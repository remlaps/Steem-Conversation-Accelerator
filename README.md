# Steem Conversation Accelerator

The Steem Conversation Accelerator is a browser extension that enhances our experience on the Steem platform by sending notifications in the browser when activity of interest occurs on the Steem blockchain.  When the notification is clicked, it opens a browser tab with a list of the recently observed activities.

If the browser goes idle and stays that way for 10 minutes, background polling will stop until it becomes active again.

## Monitored activities
### In progress / active
- [x] Notification of posts, comments, and replies for accounts that are followed by the observer account.

### TBD
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

The extension has been developed with use of the [Brave](https://brave.com) browser, and might work with other browsers that support Manifest V3.

The extension can be installed in Developer mode for the following browsers:

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
- After installing and starting the browser extension, you should receive a pop-up window asking for configuration information.  Set the observer account and change any other desired settings.

## Contributing

Thank you for your interest in contributing to the Steem Conversation Accelerator! This is a free and open-source project, and we welcome contributions from developers of all skill levels.

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

- TBD

### Issues and Bugs

If you encounter any issues or bugs while contributing, please open a new issue on the GitHub repository. We will do our best to assist you and resolve the issue as soon as possible.

## References
- (July 4, 2024): [Programming Diary #20: Accelerating organic activity](https://steemit.com/hive-151113/@remlaps/programming-diary-20-accelerating-organic)
- (July 21, 2024): [Programming Diary #21: Entertainment and collaboration](https://steemit.com/hive-151113/@remlaps/programming-diary-21-entertainment-and)
- (August 3, 2024): [Programming Diary #22: Boosting organic conversations and reflecting on support for open source development.](https://steemit.com/hive-151113/@remlaps/programming-diary-22-boosting-organic)
- (August 17, 2204): [Programming Diary #23: Warning - this tool exercises your voting power](https://steemit.com/hive-151113/@remlaps/programming-diary-23-warning-this)


## Contact Information

If you have any questions or need assistance with the Steem Conversation Accelerator, please feel free to reach out to me, @remlaps, on the Steem blockchain. You can find me by searching for my username on the Steem blockchain or by visiting my profile page.

## Managing Expectations

I believe this can be a useful tool for many participants in the Steem ecosystems, but be forewarned that it will have problems and fixes will be slow.  I am learning JavaScript, HTML, and CSS as I go here; and this is a hobby project that I can only develop in whatever spare time I can find during nights and weekends.

Additionally, for the above reasons, I am sticking to a view-only perspective, and I don't expect to incorporate anything involving the use of blockchain keys any time soon.  If this extension ever asks for your keys, you should be suspicious.

## Disclaimer

This extension is provided "as is" without warranty of any kind, either express or implied, including, but not limited to, the implied warranties of merchantability and fitness for a particular purpose. The entire risk as to the quality and performance of the extension is with you. Should the extension prove defective, you assume the cost of all necessary servicing, repair, or correction.

In no event shall the authors or copyright holders be liable for any claim, damages, or other liability, whether in an action of contract, tort, or otherwise, arising from, out of, or in connection with the extension or the use or other dealings in the extension.