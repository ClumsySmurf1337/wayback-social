"""wayback-social: archived social-media posts from the Wayback Machine.

Generalisation of claromes/waybacktweets (Twitter-only) to all social
networks, via a network registry + generic CDX client / parser / exporter.
"""
from .cdx import query_cdx, query_many
from .networks import get_network, list_networks
from .parse import FIELD_OPTIONS, PostsParser
from .export import export_all
from .presets import get_preset, list_presets

__version__ = "1.1.0"
__all__ = ["query_cdx", "query_many", "get_network", "list_networks",
           "FIELD_OPTIONS", "PostsParser", "export_all",
           "get_preset", "list_presets"]
