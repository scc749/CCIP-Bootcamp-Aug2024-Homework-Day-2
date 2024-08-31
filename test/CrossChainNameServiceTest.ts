import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer } from "ethers";
import { CCIPLocalSimulator } from "../typechain-types";

describe("CCIP Cross Chain Name Service", function () {
    let ccipLocalSimualtorFactory: any, ccipLocalSimulator: CCIPLocalSimulator;
    let ccnsRegisterFactory: any, ccnsRegister: any;
    let ccnsServiceFactory: any, ccnsReceiver: any;
    let ccnsLookupFactory: any, sourceCcnsLookup: any, destinationCcnsLookup: any;
    let alice: Signer;

    before(async function () {
        [, alice] = await ethers.getSigners(); // Make alice be a different signer from the owner (would obviously work if we took the first signer, but Alice is supposed to be a user...)

        // Deploy CCIPLocalSimulator
        ccipLocalSimualtorFactory = await ethers.getContractFactory("CCIPLocalSimulator");
        ccipLocalSimulator = await ccipLocalSimualtorFactory.deploy();
        await ccipLocalSimulator.deployed();
        console.log("CCIP Local Simulator address:", ccipLocalSimulator.address);

        // Extract the source and destination router addresses and chain selectors
        const config = await ccipLocalSimulator.configuration();
        const sourceRouterAddress = config.sourceRouter_;
        const destinationRouterAddress = config.destinationRouter_;
        const sourceChainSelector = config.chainSelector_;
        const destinationChainSelector = sourceChainSelector; // Since we're testing locally

        // Deploy contracts on "source chain"

        // CrossChainNameServiceLookup
        ccnsLookupFactory = await ethers.getContractFactory("CrossChainNameServiceLookup");
        sourceCcnsLookup = await ccnsLookupFactory.deploy();
        await sourceCcnsLookup.deployed();
        console.log("Source CrossChainNameServiceLookup address:", sourceCcnsLookup.address);

        // CrossChainNameServiceRegister
        ccnsRegisterFactory = await ethers.getContractFactory("CrossChainNameServiceRegister");
        ccnsRegister = await ccnsRegisterFactory.deploy(sourceRouterAddress, sourceCcnsLookup.address);
        await ccnsRegister.deployed();
        console.log("CrossChainNameServiceRegister address:", ccnsRegister.address);

        // Deploy contracts on "destination chain"

        // CrossChainNameServiceLookup
        ccnsServiceFactory = await ethers.getContractFactory("CrossChainNameServiceLookup");
        destinationCcnsLookup = await ccnsServiceFactory.deploy();
        await destinationCcnsLookup.deployed();
        console.log("Destination CrossChainNameServiceLookup address:", destinationCcnsLookup.address);

        // Deploy CrossChainNameServiceReceiver
        ccnsServiceFactory = await ethers.getContractFactory("CrossChainNameServiceReceiver");
        ccnsReceiver = await ccnsServiceFactory.deploy(destinationRouterAddress, destinationCcnsLookup.address, sourceChainSelector);
        await ccnsReceiver.deployed();
        console.log("CrossChainNameServiceReceiver address:", ccnsReceiver.address);

        // Set CrossChainNameServiceRegister address on CrossChainNameServiceLookup on "both" chains
        let txResponse = await sourceCcnsLookup.setCrossChainNameServiceAddress(ccnsRegister.address);
        await txResponse.wait();
        console.log("Set register address on lookup on source chain:", txResponse.hash)
        txResponse = await destinationCcnsLookup.setCrossChainNameServiceAddress(ccnsReceiver.address);
        await txResponse.wait();
        console.log("Set receiver address on lookup on destination chain:", txResponse.hash)

        // Enable "destination" chain on CrossChainNameServiceRegister
        txResponse = await ccnsRegister.enableChain(destinationChainSelector, ccnsReceiver.address, 500_000n);
        await txResponse.wait();
        console.log("Enable destination chain transaction:", txResponse.hash)
    });

    it("Should register alice.ccns on source chain and check that it is the same on both chains", async function () {
        let txResponse = await ccnsRegister.connect(alice).register("alice.ccns");
        await txResponse.wait();
        console.log("Register transaction completed:", txResponse.hash);

        // Look up alice.ccns on CrossChainNameServiceLookup on both chains and check the addresses match!
        const resolvedAddressSource = await sourceCcnsLookup.lookup("alice.ccns");
        const resolvedAddressDestination = await destinationCcnsLookup.lookup("alice.ccns");
        expect(resolvedAddressSource).to.equal(await alice.getAddress());
        expect(resolvedAddressDestination).to.equal(await alice.getAddress());
    });

});
