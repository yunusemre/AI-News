# Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).

Windows releases of **News** are built from the source code in this repository by GitHub Actions
(`.github/workflows/release.yml`) and are signed only after manual approval.

## Team roles

| Role | Member |
|------|--------|
| Committers and reviewers | [Yunus Emre Tatar](https://github.com/yunusemre) |
| Approvers | [Yunus Emre Tatar](https://github.com/yunusemre) |

Only binaries produced by the automated release workflow from this repository are signed.
All team members use multi-factor authentication for GitHub and SignPath.

## Privacy policy

This program will not transfer any information to other networked systems unless specifically requested
by the user or the person installing or operating it.

The app connects only to the following services to provide its features:

- **Firebase Realtime Database** (`news-2afea-default-rtdb.firebaseio.com`) – reads the news list (read-only, no user data is sent).
- **Article websites** – when you open an article, its page is loaded to show it in reading mode.
- **Google Translate** (`translate.googleapis.com`) – article text is sent for translation only when Turkish is selected.
- **dictionaryapi.dev** – the selected word is sent when you use the dictionary.
- **GitHub API** (`api.github.com`) – checks for and downloads new versions.

Favorites, notes, tags, word lists and settings are stored only on your computer.

## Uninstall

- **Windows:** Settings → Apps → *News* → Uninstall.
- **macOS:** move *News.app* from Applications to the Trash.
