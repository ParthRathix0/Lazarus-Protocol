// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title LazarusSource
/// @notice Dead Man's Switch contract - monitors user liveness and triggers evacuation
/// @dev Deployed on source chain (e.g., Sepolia). Uses LI.FI for cross-chain evacuation.
contract LazarusSource is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                                 CONSTANTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Time period after which a user is considered "dead" (7 days)
    uint256 public constant DEAD_MAN_TIMEOUT = 7 days;

    /// @notice Fee taken by watchtower for gas reimbursement (1% = 100 BPS)
    uint256 public constant LIQUIDATION_FEE_BPS = 100;

    /// @notice Basis points denominator
    uint256 public constant BPS_DENOMINATOR = 10000;

    /*//////////////////////////////////////////////////////////////
                                  STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice The authorized watchtower address that can trigger liquidations
    address public watchtower;

    /// @notice The LI.FI Diamond contract address for bridging
    address public lifiDiamond;

    /// @notice Mapping of user address to their beneficiary
    mapping(address => address) public beneficiaries;

    /// @notice Mapping of user address to their last heartbeat timestamp
    mapping(address => uint256) public lastHeartbeat;

    /// @notice Mapping of user address to their "dead" status
    mapping(address => bool) public isDead;

    /// @notice Mapping of user address to whether they are registered
    mapping(address => bool) public isRegistered;

    /// @notice Mapping of user => token => deposited amount
    mapping(address => mapping(address => uint256)) public userDeposits;

    /*//////////////////////////////////////////////////////////////
                                  EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when a user registers their dead man's switch
    event Registered(address indexed user, address indexed beneficiary);

    /// @notice Emitted when a user pings (heartbeat)
    event Ping(address indexed user, uint256 timestamp);

    /// @notice Emitted when a user is liquidated
    event Liquidated(
        address indexed user,
        address indexed beneficiary,
        address indexed token,
        uint256 amount
    );

    /// @notice Emitted when user deposits funds
    event FundsDeposited(address indexed user, address indexed token, uint256 amount);

    /// @notice Emitted when user withdraws funds
    event FundsWithdrawn(address indexed user, address indexed token, uint256 amount);

    /// @notice Emitted when the watchtower is updated
    event WatchtowerUpdated(address indexed oldWatchtower, address indexed newWatchtower);

    /// @notice Emitted when the LI.FI Diamond is updated
    event LiFiDiamondUpdated(address indexed oldDiamond, address indexed newDiamond);

    /*//////////////////////////////////////////////////////////////
                                  ERRORS
    //////////////////////////////////////////////////////////////*/

    error NotWatchtower();
    error AlreadyRegistered();
    error NotRegistered();
    error NotDeadYet();
    error AlreadyDead();
    error InvalidBeneficiary();
    error InvalidToken();
    error InsufficientAllowance();
    error ZeroAddress();
    error BridgeCallFailed();
    error ZeroAmount();
    error InsufficientDeposit();

    /*//////////////////////////////////////////////////////////////
                               CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @notice Initialize the contract with watchtower and LI.FI addresses
    /// @param _watchtower The authorized watchtower address
    /// @param _lifiDiamond The LI.FI Diamond contract address
    constructor(
        address _watchtower,
        address _lifiDiamond
    ) Ownable(msg.sender) {
        if (_watchtower == address(0)) revert ZeroAddress();
        if (_lifiDiamond == address(0)) revert ZeroAddress();
        
        watchtower = _watchtower;
        lifiDiamond = _lifiDiamond;
    }

    /*//////////////////////////////////////////////////////////////
                               MODIFIERS
    //////////////////////////////////////////////////////////////*/

    /// @notice Restrict function access to the watchtower only
    modifier onlyWatchtower() {
        if (msg.sender != watchtower) revert NotWatchtower();
        _;
    }

    /*//////////////////////////////////////////////////////////////
                            USER FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Register for the Dead Man's Switch
    /// @param _beneficiary The address that will receive funds if user goes inactive
    function register(address _beneficiary) external {
        if (_beneficiary == address(0)) revert InvalidBeneficiary();
        if (_beneficiary == msg.sender) revert InvalidBeneficiary();
        if (isRegistered[msg.sender]) revert AlreadyRegistered();

        beneficiaries[msg.sender] = _beneficiary;
        lastHeartbeat[msg.sender] = block.timestamp;
        isRegistered[msg.sender] = true;

        emit Registered(msg.sender, _beneficiary);
        emit Ping(msg.sender, block.timestamp);
    }

    /// @notice Update heartbeat timestamp - proves user is still alive
    /// @dev Can be called by user directly or by watchtower with Yellow Network proof
    function ping() external {
        if (!isRegistered[msg.sender]) revert NotRegistered();
        if (isDead[msg.sender]) revert AlreadyDead();

        lastHeartbeat[msg.sender] = block.timestamp;
        emit Ping(msg.sender, block.timestamp);
    }

    /// @notice Ping on behalf of a user (for Yellow Network integration)
    /// @param _user The user to ping for
    /// @dev Only watchtower can call this with verified Yellow Network proof
    function pingFor(address _user) external onlyWatchtower {
        if (!isRegistered[_user]) revert NotRegistered();
        if (isDead[_user]) revert AlreadyDead();

        lastHeartbeat[_user] = block.timestamp;
        emit Ping(_user, block.timestamp);
    }

    /// @notice Deposit tokens to be protected by the Dead Man's Switch
    /// @param _token The token to deposit
    /// @param _amount The amount to deposit
    /// @dev This counts as proof of life and resets the 7-day timer
    function depositFunds(address _token, uint256 _amount) external nonReentrant {
        if (!isRegistered[msg.sender]) revert NotRegistered();
        if (isDead[msg.sender]) revert AlreadyDead();
        if (_token == address(0)) revert InvalidToken();
        if (_amount == 0) revert ZeroAmount();

        // Pull tokens from user to this contract
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);

        // Track user's deposit
        userDeposits[msg.sender][_token] += _amount;

        // Activity counts as proof of life
        lastHeartbeat[msg.sender] = block.timestamp;

        emit FundsDeposited(msg.sender, _token, _amount);
        emit Ping(msg.sender, block.timestamp);
    }

    /// @notice Withdraw deposited tokens
    /// @param _token The token to withdraw
    /// @param _amount The amount to withdraw
    /// @dev This counts as proof of life and resets the 7-day timer
    function withdrawFunds(address _token, uint256 _amount) external nonReentrant {
        if (!isRegistered[msg.sender]) revert NotRegistered();
        if (isDead[msg.sender]) revert AlreadyDead();
        if (_token == address(0)) revert InvalidToken();
        if (_amount == 0) revert ZeroAmount();
        if (userDeposits[msg.sender][_token] < _amount) revert InsufficientDeposit();

        // Update tracked deposit
        userDeposits[msg.sender][_token] -= _amount;

        // Transfer tokens back to user
        IERC20(_token).safeTransfer(msg.sender, _amount);

        // Activity counts as proof of life
        lastHeartbeat[msg.sender] = block.timestamp;

        emit FundsWithdrawn(msg.sender, _token, _amount);
        emit Ping(msg.sender, block.timestamp);
    }

    /*//////////////////////////////////////////////////////////////
                         WATCHTOWER FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Liquidate a user's tokens and bridge to their beneficiary
    /// @param _user The user to liquidate
    /// @param _token The token to transfer
    /// @param _swapData The calldata for LI.FI swap/bridge operation
    function liquidate(
        address _user,
        address _token,
        bytes calldata _swapData
    ) external onlyWatchtower nonReentrant {
        if (!isRegistered[_user]) revert NotRegistered();
        if (_token == address(0)) revert InvalidToken();
        
        // Check if user has passed the timeout
        if (block.timestamp <= lastHeartbeat[_user] + DEAD_MAN_TIMEOUT) {
            revert NotDeadYet();
        }

        address beneficiary = beneficiaries[_user];

        // SECURITY: Validate the receiver in LI.FI calldata matches the beneficiary
        // LI.FI BridgeData struct has `receiver` at a known offset after the function selector
        // This prevents a compromised watchtower from stealing funds
        if (_swapData.length >= 68) { // 4 bytes selector + 64 bytes for first struct fields
            // The receiver is typically the 2nd field in BridgeData (after bytes32 transactionId)
            // Offset: 4 (selector) + 32 (transactionId) + 12 (address padding) = 48
            // But in practice, receiver offset varies. We check if beneficiary appears in calldata.
            bool beneficiaryFound = false;
            // Search for beneficiary address in the first 200 bytes of calldata
            uint256 searchLen = _swapData.length > 200 ? 200 : _swapData.length;
            for (uint256 i = 4; i + 20 <= searchLen; i++) {
                address extracted;
                // Extract address from calldata at position i (addresses are right-aligned in 32-byte slots)
                // We check every position in case of different struct packing
                bytes20 addrBytes;
                for (uint256 j = 0; j < 20; j++) {
                    addrBytes |= bytes20(_swapData[i + j]) >> (j * 8);
                }
                extracted = address(addrBytes);
                if (extracted == beneficiary) {
                    beneficiaryFound = true;
                    break;
                }
            }
            // If beneficiary not found in calldata, this could be malicious
            // Note: This is a heuristic check - in production, use a more robust validation
            if (!beneficiaryFound) {
                revert InvalidBeneficiary();
            }
        }

        // Mark user as dead (only on first liquidation call)
        if (!isDead[_user]) {
            isDead[_user] = true;
        }

        // Determine amount to liquidate from two sources:
        // 1. Tokens deposited to contract via depositFunds()
        // 2. Tokens approved by user (allowance-based, pulled from user's wallet)
        uint256 depositedAmount = userDeposits[_user][_token];
        uint256 allowance = IERC20(_token).allowance(_user, address(this));
        uint256 userBalance = IERC20(_token).balanceOf(_user);
        uint256 allowanceAmount = allowance < userBalance ? allowance : userBalance;
        
        uint256 amountToTransfer = depositedAmount + allowanceAmount;
        if (amountToTransfer == 0) revert InsufficientAllowance();

        // Clear user deposits for this token
        if (depositedAmount > 0) {
            userDeposits[_user][_token] = 0;
        }

        // Pull additional tokens from user wallet if they have allowance
        if (allowanceAmount > 0) {
            IERC20(_token).safeTransferFrom(_user, address(this), allowanceAmount);
        }

        // Calculate watchtower fee (1% for gas reimbursement)
        uint256 watchtowerFee = (amountToTransfer * LIQUIDATION_FEE_BPS) / BPS_DENOMINATOR;
        uint256 amountToBridge = amountToTransfer - watchtowerFee;

        // Send fee to watchtower (msg.sender)
        if (watchtowerFee > 0) {
            IERC20(_token).safeTransfer(msg.sender, watchtowerFee);
        }

        // Approve LI.FI Diamond to spend remaining tokens
        IERC20(_token).forceApprove(lifiDiamond, amountToBridge);

        // Execute LI.FI swap/bridge
        // We use .call and manually check success to bubble up the specific error message
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory returnData) = lifiDiamond.call(_swapData);
        
        if (!success) {
            // Bubble up the error message from Li.Fi for easier debugging
            if (returnData.length > 0) {
                assembly {
                    let returndata_size := mload(returnData)
                    revert(add(32, returnData), returndata_size)
                }
            } else {
                revert BridgeCallFailed();
            }
        }

        emit Liquidated(_user, beneficiary, _token, amountToBridge);
    }

    /*//////////////////////////////////////////////////////////////
                            VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Check if a user is past the timeout and can be liquidated
    /// @param _user The user to check
    /// @return canLiquidate Whether the user can be liquidated
    /// @return timeRemaining Seconds until user can be liquidated (0 if already past)
    function checkUserStatus(address _user) 
        external 
        view 
        returns (bool canLiquidate, uint256 timeRemaining) 
    {
        if (!isRegistered[_user]) {
            return (false, 0);
        }

        uint256 deadline = lastHeartbeat[_user] + DEAD_MAN_TIMEOUT;
        
        if (block.timestamp > deadline) {
            return (true, 0);
        } else {
            return (false, deadline - block.timestamp);
        }
    }

    /// @notice Get user's registration details
    /// @param _user The user to query
    function getUserInfo(address _user) 
        external 
        view 
        returns (
            bool registered,
            address beneficiary,
            uint256 lastPing,
            bool dead
        ) 
    {
        return (
            isRegistered[_user],
            beneficiaries[_user],
            lastHeartbeat[_user],
            isDead[_user]
        );
    }

    /*//////////////////////////////////////////////////////////////
                            ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Update the watchtower address
    /// @param _newWatchtower The new watchtower address
    function setWatchtower(address _newWatchtower) external onlyOwner {
        if (_newWatchtower == address(0)) revert ZeroAddress();
        
        address oldWatchtower = watchtower;
        watchtower = _newWatchtower;
        
        emit WatchtowerUpdated(oldWatchtower, _newWatchtower);
    }

    /// @notice Update the LI.FI Diamond address
    /// @param _newDiamond The new LI.FI Diamond address
    function setLiFiDiamond(address _newDiamond) external onlyOwner {
        if (_newDiamond == address(0)) revert ZeroAddress();
        
        address oldDiamond = lifiDiamond;
        lifiDiamond = _newDiamond;
        
        emit LiFiDiamondUpdated(oldDiamond, _newDiamond);
    }

    /// @notice Emergency rescue of stuck tokens
    /// @param _token The token to rescue
    /// @param _to The address to send tokens to
    function rescueTokens(address _token, address _to) external onlyOwner {
        uint256 balance = IERC20(_token).balanceOf(address(this));
        IERC20(_token).safeTransfer(_to, balance);
    }
}
