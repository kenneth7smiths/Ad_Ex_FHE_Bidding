pragma solidity ^0.8.24;
import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract AdExFHEBiddingFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error InvalidBatch();
    error InvalidState();
    error ReplayDetected();
    error InvalidProof();
    error NotInitialized();

    address public owner;
    mapping(address => bool) public providers;
    bool public paused;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    struct Bid {
        euint32 encryptedBidAmount;
        euint32 encryptedTargetingScore;
        address bidder;
    }

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }

    mapping(uint256 => Bid[]) public batchBids;
    mapping(uint256 => bool) public batchActive;
    mapping(uint256 => bool) public batchClosed;
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event PausedSet(bool paused);
    event CooldownSecondsSet(uint256 cooldownSeconds);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId);
    event BidSubmitted(address indexed bidder, uint256 indexed batchId);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256 winningBidAmount, address winner);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!providers[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier submissionRateLimited() {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        lastSubmissionTime[msg.sender] = block.timestamp;
        _;
    }

    modifier decryptionRateLimited() {
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        lastDecryptionRequestTime[msg.sender] = block.timestamp;
        _;
    }

    constructor() {
        owner = msg.sender;
        providers[owner] = true;
        cooldownSeconds = 10; // Default cooldown
        emit ProviderAdded(owner);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        providers[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        providers[provider] = false;
        emit ProviderRemoved(provider);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PausedSet(_paused);
    }

    function setCooldownSeconds(uint256 _cooldownSeconds) external onlyOwner {
        cooldownSeconds = _cooldownSeconds;
        emit CooldownSecondsSet(_cooldownSeconds);
    }

    function openBatch(uint256 batchId) external onlyProvider whenNotPaused {
        if (batchActive[batchId] || batchClosed[batchId]) revert InvalidBatch();
        batchActive[batchId] = true;
        emit BatchOpened(batchId);
    }

    function closeBatch(uint256 batchId) external onlyProvider whenNotPaused {
        if (!batchActive[batchId]) revert InvalidBatch();
        batchActive[batchId] = false;
        batchClosed[batchId] = true;
        emit BatchClosed(batchId);
    }

    function submitBid(
        uint256 batchId,
        euint32 encryptedBidAmount,
        euint32 encryptedTargetingScore
    ) external whenNotPaused submissionRateLimited {
        if (!batchActive[batchId]) revert InvalidBatch();
        _initIfNeeded(encryptedBidAmount);
        _initIfNeeded(encryptedTargetingScore);

        Bid memory newBid = Bid(encryptedBidAmount, encryptedTargetingScore, msg.sender);
        batchBids[batchId].push(newBid);
        emit BidSubmitted(msg.sender, batchId);
    }

    function requestAuctionResultDecryption(uint256 batchId)
        external
        whenNotPaused
        decryptionRateLimited
        onlyProvider
    {
        if (!batchClosed[batchId] || batchBids[batchId].length == 0) revert InvalidBatch();

        euint32 encryptedWinningBidAmount;
        address winner;
        uint256 numBids = batchBids[batchId].length;

        if (numBids == 1) {
            Bid memory bid = batchBids[batchId][0];
            encryptedWinningBidAmount = bid.encryptedBidAmount;
            winner = bid.bidder;
        } else {
            Bid memory highestBid = batchBids[batchId][0];
            for (uint256 i = 1; i < numBids; i++) {
                Bid memory currentBid = batchBids[batchId][i];
                ebool isHigher = currentBid.encryptedBidAmount.ge(highestBid.encryptedBidAmount);
                if (isHigher.toBool()) {
                    highestBid = currentBid;
                }
            }
            encryptedWinningBidAmount = highestBid.encryptedBidAmount;
            winner = highestBid.bidder;
        }

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(encryptedWinningBidAmount);

        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);

        decryptionContexts[requestId] = DecryptionContext({
            batchId: batchId,
            stateHash: stateHash,
            processed: false
        });

        emit DecryptionRequested(requestId, batchId);
    }

    function myCallback(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        if (decryptionContexts[requestId].processed) revert ReplayDetected();
        // @dev Replay protection: ensures a requestId is processed only once.

        uint256 batchId = decryptionContexts[requestId].batchId;

        euint32 encryptedWinningBidAmount;
        if (batchBids[batchId].length == 1) {
            encryptedWinningBidAmount = batchBids[batchId][0].encryptedBidAmount;
        } else {
            Bid memory highestBid = batchBids[batchId][0];
            for (uint256 i = 1; i < batchBids[batchId].length; i++) {
                Bid memory currentBid = batchBids[batchId][i];
                ebool isHigher = currentBid.encryptedBidAmount.ge(highestBid.encryptedBidAmount);
                if (isHigher.toBool()) {
                    highestBid = currentBid;
                }
            }
            encryptedWinningBidAmount = highestBid.encryptedBidAmount;
        }

        bytes32[] memory currentCts = new bytes32[](1);
        currentCts[0] = FHE.toBytes32(encryptedWinningBidAmount);
        bytes32 currentHash = _hashCiphertexts(currentCts);

        // @dev State verification: ensures the contract state relevant to the decryption
        // has not changed since the decryption was requested.
        if (currentHash != decryptionContexts[requestId].stateHash) revert InvalidState();

        if (!FHE.checkSignatures(requestId, cleartexts, proof)) revert InvalidProof();

        uint256 winningBidAmount = abi.decode(cleartexts, (uint32));
        address winner;
        if (batchBids[batchId].length == 1) {
            winner = batchBids[batchId][0].bidder;
        } else {
            Bid memory highestBid = batchBids[batchId][0];
            for (uint256 i = 1; i < batchBids[batchId].length; i++) {
                Bid memory currentBid = batchBids[batchId][i];
                ebool isHigher = currentBid.encryptedBidAmount.ge(highestBid.encryptedBidAmount);
                if (isHigher.toBool()) {
                    highestBid = currentBid;
                }
            }
            winner = highestBid.bidder;
        }

        decryptionContexts[requestId].processed = true;
        emit DecryptionCompleted(requestId, batchId, winningBidAmount, winner);
    }

    function _hashCiphertexts(bytes32[] memory cts) internal view returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 x) internal {
        if (!x.isInitialized()) revert NotInitialized();
    }

    function _initIfNeeded(ebool x) internal {
        if (!x.isInitialized()) revert NotInitialized();
    }
}