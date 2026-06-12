# Markus examples

Sample `.mks` files grouped by intent. All paths below are from the **repo root**.

## Layout

```
examples/
  README.md           <- this file
  assets/
    refs.bib          <- shared bibliography for formal / cited informal docs
  quickstart/
    minimal.mks       <- smallest end-to-end demo
  formal/
    ieee-minimal.mks      <- short IEEE conference paper
    feature-showcase.mks  <- full IEEE paper (all major Markus features)
  informal/
    lecture-notes.mks     <- course lecture notes
    meeting-minutes.mks   <- lab meeting minutes + action items
    research-notes.mks    <- personal research log with citations
    weekly-planner.mks    <- todos and weekly schedule tables
    lab-handout.mks       <- lab procedure handout
    seminar-discussion.mks <- paper discussion prep
```

## Build commands

```bash
pip install -e .

# Quickstart
markus build examples/quickstart/minimal.mks

# Formal (IEEE uses bundled IEEEtran on minimal TeX Live)
markus build examples/formal/ieee-minimal.mks
markus build examples/formal/feature-showcase.mks

# Informal (no YAML needed — empty front matter → notes template, no title page)
markus build examples/informal/lecture-notes.mks
markus build examples/informal/meeting-minutes.mks
markus build examples/informal/weekly-planner.mks
```

Preview in Cursor: open any `.mks` file and use the Markus preview command.

## Which example should I open?

| Goal | File |
|------|------|
| First time with Markus | `quickstart/minimal.mks` |
| IEEE conference layout | `formal/ieee-minimal.mks` |
| Every feature (math, refs, theorems, code, bib) | `formal/feature-showcase.mks` |
| Class notes | `informal/lecture-notes.mks` |
| Meeting notes + todos | `informal/meeting-minutes.mks` |
| Personal research log | `informal/research-notes.mks` |
| Week plan / task list | `informal/weekly-planner.mks` |
| Lab worksheet | `informal/lab-handout.mks` |
| Journal club prep | `informal/seminar-discussion.mks` |
