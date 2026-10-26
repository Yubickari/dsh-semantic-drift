# Security

This plugin runs inside your DSH process. It reads source files, writes one YAML
file (`.dsh/semantics.yaml`) through a single validated path, and registers five
tools, nine routes and one prompt section. It makes no network requests of its own.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private vulnerability reporting
on this repository (Security → Report a vulnerability), or contact the maintainer
directly. Include:

- the plugin version (panel footer, or `GET /semantic-drift/health`),
- the DSH version,
- the smallest reproduction you can give with invented names,
- what an attacker could do with it.

You will normally get an answer within a week. If the report is valid, a fix ships
in a patch release and the advisory is published with credit unless you prefer
otherwise.

## Scope worth knowing

- A workspace path outside a registered DSH workspace (or the Host's default
  directory) is refused; write routes must name their workspace.
- The scan never writes; the vocabulary is the only file the plugin writes.
- The prompt section carries project vocabulary into every agent prompt. If a
  vocabulary contains secrets, they will end up in prompts: do not put secrets in
  it, and remember the switch that turns the section off.
