## Description
<!-- Provide a clear and concise description of what this PR does -->

## Screenshots / Demos (Required for UI Changes)
| Before | After |
| :---: | :---: |
| <img src="" width="300" /> | <img src="" width="300" /> |

## Type of Change
- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] ✨ New feature (non-breaking change which adds functionality)
- [ ] 🎨 UI/UX improvement
- [ ] ♻️ Refactoring (no functional changes, no api changes)

## Browser Testing
- [ ] Chrome / Chromium
- [ ] Firefox
- [ ] Safari / WebKit
- [ ] Mobile View

## Checklist
- [ ] I have performed a self-review of my code.
- [ ] My changes generate no new console warnings or errors.
- [ ] I have verified the UI is responsive (looks good on different screen sizes).

## CI/CD Policy Checklist

- [ ] This PR does **not** introduce direct Kubernetes deploy logic in this service repo (no `kubectl`, no `kustomize`, no `runs-on: [self-hosted, ...]`).
- [ ] Deployment changes (image/config) are handled via `faultmaven-enterprise-infra` promotion + overlays.
