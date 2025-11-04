pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract HeirloomFHE is ZamaEthereumConfig {
    struct InheritanceRule {
        string ruleId;
        address beneficiary;
        euint32 encryptedAmount;
        uint256 triggerTime;
        bool isTriggered;
        uint32 decryptedAmount;
        bool isVerified;
    }

    mapping(string => InheritanceRule) public inheritanceRules;
    string[] public ruleIds;

    event RuleCreated(string indexed ruleId, address indexed creator);
    event RuleTriggered(string indexed ruleId, address indexed beneficiary, uint32 amount);
    event DecryptionVerified(string indexed ruleId, uint32 decryptedAmount);

    constructor() ZamaEthereumConfig() {}

    function createRule(
        string calldata ruleId,
        address beneficiary,
        externalEuint32 encryptedAmount,
        bytes calldata inputProof,
        uint256 triggerTime
    ) external {
        require(bytes(inheritanceRules[ruleId].ruleId).length == 0, "Rule already exists");
        require(FHE.isInitialized(FHE.fromExternal(encryptedAmount, inputProof)), "Invalid encrypted input");

        inheritanceRules[ruleId] = InheritanceRule({
            ruleId: ruleId,
            beneficiary: beneficiary,
            encryptedAmount: FHE.fromExternal(encryptedAmount, inputProof),
            triggerTime: triggerTime,
            isTriggered: false,
            decryptedAmount: 0,
            isVerified: false
        });

        FHE.allowThis(inheritanceRules[ruleId].encryptedAmount);
        FHE.makePubliclyDecryptable(inheritanceRules[ruleId].encryptedAmount);

        ruleIds.push(ruleId);
        emit RuleCreated(ruleId, msg.sender);
    }

    function triggerRule(string calldata ruleId) external {
        InheritanceRule storage rule = inheritanceRules[ruleId];
        require(bytes(rule.ruleId).length > 0, "Rule does not exist");
        require(block.timestamp >= rule.triggerTime, "Trigger time not reached");
        require(!rule.isTriggered, "Rule already triggered");
        require(rule.isVerified, "Decryption not verified");

        rule.isTriggered = true;
        emit RuleTriggered(ruleId, rule.beneficiary, rule.decryptedAmount);
    }

    function verifyDecryption(
        string calldata ruleId,
        bytes memory abiEncodedClearAmount,
        bytes memory decryptionProof
    ) external {
        InheritanceRule storage rule = inheritanceRules[ruleId];
        require(bytes(rule.ruleId).length > 0, "Rule does not exist");
        require(!rule.isVerified, "Decryption already verified");

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(rule.encryptedAmount);

        FHE.checkSignatures(cts, abiEncodedClearAmount, decryptionProof);

        uint32 decodedAmount = abi.decode(abiEncodedClearAmount, (uint32));
        rule.decryptedAmount = decodedAmount;
        rule.isVerified = true;

        emit DecryptionVerified(ruleId, decodedAmount);
    }

    function getEncryptedAmount(string calldata ruleId) external view returns (euint32) {
        require(bytes(inheritanceRules[ruleId].ruleId).length > 0, "Rule does not exist");
        return inheritanceRules[ruleId].encryptedAmount;
    }

    function getRuleDetails(string calldata ruleId) external view returns (
        address beneficiary,
        uint256 triggerTime,
        bool isTriggered,
        uint32 decryptedAmount,
        bool isVerified
    ) {
        require(bytes(inheritanceRules[ruleId].ruleId).length > 0, "Rule does not exist");
        InheritanceRule storage rule = inheritanceRules[ruleId];

        return (
            rule.beneficiary,
            rule.triggerTime,
            rule.isTriggered,
            rule.decryptedAmount,
            rule.isVerified
        );
    }

    function getAllRuleIds() external view returns (string[] memory) {
        return ruleIds;
    }

    function isAvailable() public pure returns (bool) {
        return true;
    }
}


