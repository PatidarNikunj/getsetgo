# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

This repository is currently a bare skeleton — there is no application code yet. It contains only:

- `README.md` — a single-line title (`# getsetgo`), not yet fleshed out.
- `LICENSE` — project license.
- `.gitignore` — GitHub's standard Python template (covers bytecode, packaging artifacts, virtualenvs, and tooling caches for pip/Poetry/PDM/uv/pipenv, plus Django/Flask/Scrapy/Jupyter cruft). Its presence suggests the project is intended to be Python-based, but no Python code, dependency manifest (e.g. `pyproject.toml`, `requirements.txt`), or project layout has been added yet.

There are no build, lint, or test commands to run because no source tree, package manifest, or test suite exists yet.

## Working in this repo

Since there is no established structure yet, when the first real code is added:

- Check whether a dependency manifest (`pyproject.toml`, `requirements.txt`, etc.) has been introduced before assuming a package manager — none exists as of this writing.
- Update this file once actual source directories, entry points, and test/build tooling exist, since none of that can be documented yet.
