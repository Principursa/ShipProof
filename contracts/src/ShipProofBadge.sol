// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract ShipProofBadge is ERC721, Ownable {
    address public shipProof;
    uint256 private _nextTokenId;

    mapping(uint256 => bytes32) public tokenAttestation;

    error OnlyShipProof();
    error Soulbound();
    error InvalidAddress();

    event ShipProofUpdated(address indexed oldShipProof, address indexed newShipProof);

    constructor(address _shipProof) ERC721("ShipProof Badge", "SPBADGE") Ownable(msg.sender) {
        shipProof = _shipProof;
    }

    function mint(address to, bytes32 attestationId) external returns (uint256 tokenId) {
        if (msg.sender != shipProof) revert OnlyShipProof();
        tokenId = _nextTokenId++;
        tokenAttestation[tokenId] = attestationId;
        _mint(to, tokenId);
    }

    function setShipProof(address _shipProof) external onlyOwner {
        if (_shipProof == address(0)) revert InvalidAddress();
        emit ShipProofUpdated(shipProof, _shipProof);
        shipProof = _shipProof;
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }
}
