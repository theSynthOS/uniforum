// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Uniforum Offchain Resolver (ENSIP-10 / CCIP-Read)
 *
 * This resolver delegates record resolution to an offchain gateway.
 * The gateway returns a signed response that is verified onchain.
 */
contract UniforumOffchainResolver {
    error OffchainLookup(
        address sender,
        string[] urls,
        bytes callData,
        bytes4 callbackFunction,
        bytes extraData
    );

    event OwnerChanged(address indexed previousOwner, address indexed newOwner);
    event SignerChanged(address indexed signer);
    event GatewaysChanged(string[] urls);

    address public owner;
    address public signer;
    string[] public gateways;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    constructor(address initialSigner, string[] memory initialGateways) {
        owner = msg.sender;
        signer = initialSigner;
        gateways = initialGateways;
    }

    function setSigner(address newSigner) external onlyOwner {
        signer = newSigner;
        emit SignerChanged(newSigner);
    }

    function setGateways(string[] calldata newGateways) external onlyOwner {
        gateways = newGateways;
        emit GatewaysChanged(newGateways);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        emit OwnerChanged(owner, newOwner);
        owner = newOwner;
    }

    /**
     * ENSIP-10 resolve.
     * Reverts with OffchainLookup to trigger CCIP-Read.
     */
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory) {
        bytes memory callData = abi.encodeWithSelector(this.resolve.selector, name, data);
        revert OffchainLookup(
            address(this),
            gateways,
            callData,
            this.resolveWithProof.selector,
            ""
        );
    }

    /**
     * Callback invoked by CCIP-Read clients with offchain proof.
     *
     * The gateway response is expected to be:
     * abi.encode(bytes result, uint64 expires, bytes sig)
     */
    function resolveWithProof(bytes calldata response, bytes calldata extraData)
        external
        view
        returns (bytes memory)
    {
        extraData; // not used

        (bytes memory result, uint64 expires, bytes memory sig) = abi.decode(
            response,
            (bytes, uint64, bytes)
        );

        require(signer != address(0), "Signer not set");
        require(block.timestamp <= expires, "Signature expired");

        bytes32 requestHash = keccak256(msg.data);
        bytes32 responseHash = keccak256(response);

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x00",
                address(this),
                expires,
                requestHash,
                responseHash
            )
        );

        require(_recover(digest, sig) == signer, "Invalid signature");
        return result;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        // IExtendedResolver.resolve(bytes,bytes) interface ID: 0x9061b923
        return interfaceId == 0x9061b923;
    }

    function _recover(bytes32 digest, bytes memory signature) internal pure returns (address) {
        require(signature.length == 65, "Invalid signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 0x20))
            s := mload(add(signature, 0x40))
            v := byte(0, mload(add(signature, 0x60)))
        }
        if (v < 27) {
            v += 27;
        }
        require(v == 27 || v == 28, "Invalid signature v");
        return ecrecover(digest, v, r, s);
    }
}
