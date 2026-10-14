"""
Graph Neural Network Architecture for TRACE-X Bitcoin Forensic Platform.
Implements a 2-layer GraphSAGE network for transaction classification.
"""

from typing import Optional, Tuple
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import SAGEConv


class BitcoinGraphSAGE(nn.Module):
    """
    Two-layer GraphSAGE model for Bitcoin transaction forensic classification.
    Aggregates neighborhood transaction representations through message passing.

    Attributes:
        conv1 (SAGEConv): First graph convolution aggregating 1-hop neighbor features.
        conv2 (SAGEConv): Second graph convolution aggregating 2-hop neighbor representations.
        dropout (nn.Dropout): Dropout regularization to prevent overfitting on minority class.
        classifier (nn.Linear): Classification head producing binary logits (Licit vs Illicit).
    """

    def __init__(
        self,
        in_channels: int = 165,
        hidden_channels: int = 128,
        out_channels: int = 2,
        dropout: float = 0.3,
        aggr: str = "mean"
    ):
        super().__init__()
        self.in_channels = in_channels
        self.hidden_channels = hidden_channels
        self.out_channels = out_channels
        self.dropout_p = dropout

        # Layer 1: 1-hop aggregation
        self.conv1 = SAGEConv(in_channels, hidden_channels, aggr=aggr)
        self.bn1 = nn.BatchNorm1d(hidden_channels)

        # Layer 2: 2-hop aggregation
        self.conv2 = SAGEConv(hidden_channels, hidden_channels, aggr=aggr)
        self.bn2 = nn.BatchNorm1d(hidden_channels)

        self.dropout = nn.Dropout(p=dropout)

        # Classification projection
        self.classifier = nn.Linear(hidden_channels, out_channels)

    def forward(
        self,
        x: torch.Tensor,
        edge_index: torch.Tensor
    ) -> torch.Tensor:
        """
        Forward pass through 2-layer GraphSAGE.

        Args:
            x: Node feature tensor [num_nodes, in_channels]
            edge_index: Graph connectivity tensor [2, num_edges]

        Returns:
            Logits tensor [num_nodes, out_channels]
        """
        # First GraphSAGE convolution
        h = self.conv1(x, edge_index)
        h = self.bn1(h)
        h = F.relu(h)
        h = self.dropout(h)

        # Second GraphSAGE convolution
        h = self.conv2(h, edge_index)
        h = self.bn2(h)
        h = F.relu(h)
        h = self.dropout(h)

        # Final classification logits
        logits = self.classifier(h)
        return logits

    def predict_proba(
        self,
        x: torch.Tensor,
        edge_index: torch.Tensor
    ) -> torch.Tensor:
        """
        Computes normalized class probabilities via softmax.

        Returns:
            Probabilities tensor [num_nodes, 2] where column 1 is Illicit probability.
        """
        self.eval()
        with torch.no_grad():
            logits = self.forward(x, edge_index)
            probs = F.softmax(logits, dim=1)
        return probs
