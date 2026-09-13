# remote/

`config.json` is fetched by every install of the isolated build, straight from GitHub:

```
https://raw.githubusercontent.com/escaper01/subtitler-config/main/config.json
```

That is a separate, **public** repository — this one is private, and raw GitHub answers
404 for a private file. The file is **authored here** and pushed there:

```bash
npm run config:publish     # needs `gh` signed in; refuses a file that does not parse
```

Never edit it in `subtitler-config` directly; the next publish overwrites the change.

It is the only thing this build reads that is not subtitlecat or TVmaze, and it is how two
things change without shipping a new build:

- **the selectors** the parser uses on subtitlecat's HTML. When the site renames a class,
  edit the selector here and publish; installs pick it up within six hours. Then change the
  same value in `src/lib/subtitlecat/config.ts` (`DEFAULT_CONFIG`) so the next build's
  bundled fallback is right too.
- **the donation prompt**. Set `enabled` to `true`, write the heading and the message, add
  links. URLs must be `http`/`https`; the colour must be `#rrggbb`. Anything else is dropped
  on the client, not rendered.

Every field is optional. A missing or malformed one falls back to the bundled default, so a
broken edit degrades to the previous behaviour rather than taking search down. `base` must
be an `https` origin and `searchPath` must start with `/` and contain `{query}`.

Test a selector change before pushing it:

```bash
LIVE=1 npm test
```

That runs the parser with the **bundled** selectors against the live site, so bump
`DEFAULT_CONFIG` first and run it, then copy the values here.
