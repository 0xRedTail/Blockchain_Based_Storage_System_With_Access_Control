// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

contract FileStorage {
    struct File {
        string ipfsHash;
        address owner;
        string fileName;
        address[] sharedWith;
    }

    mapping(string => File) private files;
    mapping(address => string[]) private userFiles;
    mapping(address => string[]) private sharedWithUser;

    event FileAccessed(string ipfsHash, address accessor, uint timestamp); // ✅ NEW

    function uploadFile(string memory _ipfsHash, string memory _fileName) public {
        require(bytes(files[_ipfsHash].ipfsHash).length == 0, "File already exists");

        address[] memory emptyArray;

        files[_ipfsHash] = File({
            ipfsHash: _ipfsHash,
            owner: msg.sender,
            fileName: _fileName,
            sharedWith: emptyArray
        });

        userFiles[msg.sender].push(_ipfsHash);
    }

    function shareFile(string memory _ipfsHash, address _user) public {
        require(files[_ipfsHash].owner == msg.sender, "Not the file owner");

        // Prevent duplicate sharing
        bool alreadyShared = false;
        for (uint i = 0; i < files[_ipfsHash].sharedWith.length; i++) {
            if (files[_ipfsHash].sharedWith[i] == _user) {
                alreadyShared = true;
                break;
            }
        }

        if (!alreadyShared) {
            files[_ipfsHash].sharedWith.push(_user);
            sharedWithUser[_user].push(_ipfsHash);
        }
    }

    function getMyFiles() public view returns (string[] memory) {
        return userFiles[msg.sender];
    }

    function getSharedFiles() public view returns (string[] memory) {
        return sharedWithUser[msg.sender];
    }

    function getFile(string memory _ipfsHash) public view returns (string memory, string memory, address) {
        File memory file = files[_ipfsHash];
        require(file.owner == msg.sender || isSharedWith(_ipfsHash, msg.sender), "Access denied");
        return (file.ipfsHash, file.fileName, file.owner);
    }

    function isSharedWith(string memory _ipfsHash, address _user) private view returns (bool) {
        File memory file = files[_ipfsHash];
        for (uint i = 0; i < file.sharedWith.length; i++) {
            if (file.sharedWith[i] == _user) {
                return true;
            }
        }
        return false;
    }

    // ✅ New: Log file access event
    function logAccess(string memory _ipfsHash) public {
        File memory file = files[_ipfsHash];
        require(
            file.owner == msg.sender || isSharedWith(_ipfsHash, msg.sender),
            "Unauthorized access"
        );

        emit FileAccessed(_ipfsHash, msg.sender, block.timestamp);
    }
}
