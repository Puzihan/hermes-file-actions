"""file-actions — desktop-only Hermes plugin.

The working code is the desktop half, ``desktop/plugin.js``: it registers the
``::filerow{path="…"}`` transcript directive that puts reveal / open / copy
actions on a file the assistant mentions in chat. The desktop app loads that
file on its own (``desktop-plugins/`` disk door, or projected out of this
package), so there is nothing agent-side to wire up.

This module exists so the package loads cleanly as a Hermes plugin instead of
warning on every start with "No __init__.py".
"""


def register(ctx):  # noqa: ARG001 — plugin contract entry point
    """Nothing to register: this plugin's surface is the desktop half."""
    return None
