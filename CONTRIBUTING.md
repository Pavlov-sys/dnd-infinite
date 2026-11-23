# Contributing

Thanks for helping! Guidelines:

1. **No build step.** Plain ES modules, no framework. Keep it that way unless there's a strong reason.
2. **Logic goes in `js/engine/`** (pure, testable, no DOM). UI goes in `js/ui/`. Add a test in `tests/` for rules changes: `node --test tests/*.test.js`.
3. **Content goes in `js/data/srd/`** and must come from the SRD 5.2 (CC-BY-4.0). Summarize in your own words or quote the SRD; never copy non-SRD published books or use Wizards of the Coast trademarks.
4. Follow the schema in `docs/data-format.md` so homebrew and SRD content stay interchangeable.
5. Keep the builder friendly: every choice should explain what it does in plain language.
6. Characters are stored as choices only; never store derived numbers (AC, HP max, etc.).
