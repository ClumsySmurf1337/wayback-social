"""CLI: wayback-social — archived posts from the Wayback Machine,
for all social networks, not just Twitter.

Thin dispatcher (issue #12): the ``main`` group lives here and every
command is registered from its own module under wayback_social/commands/
(or the older extra_commands / commands_v15 modules). Usage:

  wayback-social networks
  wayback-social archive x jack
  wayback-social archive tiktok @tiktok --from 20220101 --limit 100
  wayback-social archive youtube @NASA --no-fetch-text
  wayback-social archive mastodon gargron --instance mastodon.social
  wayback-social archive --url https://www.instagram.com/p/C-a6bDVy7hz/
  wayback-social archive reddit spez --format json
"""
from __future__ import annotations

import click

from .commands.archive import archive_cmd
from .commands.batch import batch_cmd
from .commands.diff import diff_cmd
from .commands.find import find_cmd
from .commands.info import networks_cmd, presets_cmd
from .commands.licence import licence_group
from .commands_v15 import cc_cmd, live_cmd, rss_cmd, sources_cmd
from .extra_commands import arquivo_cmd, evidence_cmd

VERSION = "1.5.0"


@click.group(context_settings={"help_option_names": ["-h", "--help"]})
@click.version_option(version=VERSION, prog_name="wayback-social")
def main():
    """Retrieve archived social-media posts from the Wayback Machine."""


# Commands from the split-out modules (issue #12) plus the older
# extra_commands / commands_v15 modules — all registered here, in one place.
main.add_command(licence_group)
main.add_command(archive_cmd)
main.add_command(diff_cmd)
main.add_command(find_cmd)
main.add_command(batch_cmd)
main.add_command(networks_cmd)
main.add_command(presets_cmd)
main.add_command(evidence_cmd)
main.add_command(arquivo_cmd)
main.add_command(live_cmd)
main.add_command(sources_cmd)
main.add_command(cc_cmd)
main.add_command(rss_cmd)


if __name__ == "__main__":
    main()
