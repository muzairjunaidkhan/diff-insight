// README.md
# diff-insight

Multi-language git diff analyzer that provides human-readable summaries of meaningful changes.

## Installation

```bash
npm install
npm link  # For global CLI access
```

## Usage

```bash
# Basic usage
diff-insight main

# With risk scoring
diff-insight main --risk

# Filter specific files
diff-insight main --files "*.js,*.jsx"

# JSON output
diff-insight main --json
```

## Supported Languages

- JavaScript (.js)
- TypeScript (.ts)
- React (.jsx, .tsx)
- HTML (.html)
- CSS (.css)
- SCSS (.scss)
- jQuery
- JSON

## Features

- Function/component rename detection
- Import/export changes
- Hook usage analysis (React)
- DOM structure changes (HTML)
- Selector and style changes (CSS/SCSS)
- Event handler modifications (jQuery)
- Risk assessment for critical files


## Example Output

```
=== Diff Insight Summary ===

[HIGH]

auth.js (javascript)
  • Removed function: login
  • Added function: authenticateUser
  • Added error handling

[MEDIUM]

LoginForm.jsx (react)
  • Added hook: useState
  • Event handlers modified

[LOW]

styles.css (css)
  • Added selector: .error-message
  • Color property changed

Total files analyzed: 3
```

## Use Cases

- **Code Reviews**: Quickly understand what changed in a PR
- **CI/CD Integration**: Automated change analysis in pipelines
- **Team Communication**: Share meaningful diffs with non-technical stakeholders
- **Risk Assessment**: Identify high-risk changes before deployment

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT

## Author

Muhammad Uzair Junaid Khan

## Support