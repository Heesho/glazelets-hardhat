const { ethers } = require("hardhat");
const hre = require("hardhat");
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));
const convert = (amount, decimals) => ethers.utils.parseUnits(amount, decimals);

/*===================================================================*/
/*===========================  SETTINGS  ============================*/

// Existing Donut contract address
const DONUT_ADDRESS = "0xae4a37d554c6d6f3e398546d8566b25052e0169c";

// Mint price in DONUT tokens
const MINT_PRICE_AMOUNT = "1";
const MINT_PRICE = convert(MINT_PRICE_AMOUNT, 18);

/*===========================  END SETTINGS  ========================*/
/*===================================================================*/

// Contract Variables
let glazelets;

/*===================================================================*/
/*===========================  CONTRACT DATA  =======================*/

async function getContracts() {
  glazelets = await ethers.getContractAt(
    "contracts/Glazelets.sol:Glazelets",
    "0xea5c38aB557f0b7d1E0d96f3befB6c8C74148395" // UPDATE WITH DEPLOYED ADDRESS
  );
  console.log("Contracts Retrieved");
}

/*===========================  END CONTRACT DATA  ===================*/
/*===================================================================*/

async function deployGlazelets() {
  console.log("Starting Glazelets Deployment");
  console.log("Using Donut address:", DONUT_ADDRESS);
  console.log(
    "Using mint price:",
    ethers.utils.formatEther(MINT_PRICE),
    "DONUT"
  );

  const glazeletsArtifact = await ethers.getContractFactory("Glazelets");
  const glazeletsContract = await glazeletsArtifact.deploy(
    MINT_PRICE,
    DONUT_ADDRESS,
    {
      gasPrice: ethers.gasPrice,
    }
  );
  glazelets = await glazeletsContract.deployed();
  await sleep(5000);
  console.log("Glazelets Deployed at:", glazelets.address);
}

async function verifyGlazelets() {
  console.log("Starting Glazelets Verification");
  await hre.run("verify:verify", {
    address: glazelets.address,
    contract: "contracts/Glazelets.sol:Glazelets",
    constructorArguments: [MINT_PRICE, DONUT_ADDRESS],
  });
  console.log("Glazelets Verified");
}

async function printDeployment() {
  console.log("**************************************************************");
  console.log("Donut:     ", DONUT_ADDRESS);
  console.log("Glazelets: ", glazelets.address);
  console.log("**************************************************************");
}

async function main() {
  const [wallet] = await ethers.getSigners();
  console.log("Using wallet: ", wallet.address);

  await getContracts();

  //===================================================================
  // Deploy System
  //===================================================================

  // console.log("Starting System Deployment");
  // await deployGlazelets();
  // await printDeployment();

  /*********** UPDATE getContracts() with new addresses *************/

  //===================================================================
  // Verify System
  //===================================================================

  // console.log("Starting System Verification");
  // await verifyGlazelets();
  // await sleep(5000);

  //===================================================================
  // Post-Deploy Configuration
  //===================================================================

  // await glazelets.setMintPrice(MINT_PRICE);
  // console.log("Mint price set to:", MINT_PRICE_AMOUNT, "DONUT");

  // console.log(
  //   "Mint price:",
  //   ethers.utils.formatEther(await glazelets.mintPrice())
  // );

  // await glazelets.setBaseURI("");
  // console.log("Base URI set");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
