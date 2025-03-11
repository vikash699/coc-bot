require('dotenv').config();
const ethers = require('ethers');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CONTRACT_ADDRESS = '0x0fbBBd928EA4eDDd2EAfF51D4D412a3b65452F40';
const RPC_URL = 'https://mainnet.base.org/';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const CHECK_INTERVAL = 5000; 
const LOG_FILE = path.join(__dirname, 'claim-log.txt');

let hasClaimedSuccessfully = false;

const ABI = [
  {
    "inputs": [
      {"internalType": "uint256", "name": "points", "type": "uint256"},
      {"internalType": "uint256", "name": "coins", "type": "uint256"},
      {"internalType": "bytes", "name": "signature", "type": "bytes"}
    ],
    "name": "claimRewards",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

function clearConsole() {
  process.stdout.write('\x1Bc');
}

function logMessage(message, toConsole = true) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  
  if (toConsole) {
    console.log(message);
  }
  
  fs.appendFileSync(LOG_FILE, logEntry);
}

let currentPointsBalance = 0;
let userNickname = '';
let userLevel = 0;
let userExperience = 0;
let userIsBanned = false;

function displayCountdown(formattedTime) {
  clearConsole();
  console.log('=============================================');
  console.log('  CLASH OF COINS CLAIM BOT - LEVI REKT');
  console.log('=============================================');
  console.log('');
  console.log(`🕒 Next claim available in: ${formattedTime}`);
  console.log(`👤 Nickname: ${userNickname}`);
  console.log(`📊 Level: ${userLevel} (XP: ${userExperience})`);
  console.log(`💎 Points: ${currentPointsBalance}`);
  console.log(`🚫 Account Banned: ${userIsBanned ? 'YES' : 'NO'}`);
  if (userIsBanned) {
    console.log(`⚠️ WARNING: YOUR ACCOUNT IS BANNED ⚠️`);
  }
  if (hasClaimedSuccessfully) {
    console.log(`✅ CLAIM STATUS: Already claimed successfully once`);
  }
  console.log('');
  console.log('Bot is running and waiting for the next claim...');
  console.log('Press Ctrl+C to stop');
  console.log('');
  console.log('=========================================');
}

function displayReadyToClaim() {
  clearConsole();
  console.log('=============================================');
  console.log('  CLASH OF COINS CLAIM BOT - JACK RICH');
  console.log('=============================================');
  console.log('');
  console.log('✅ REWARDS ARE AVAILABLE!');
  console.log('   Attempting to claim now...');
  console.log(`👤 Nickname: ${userNickname}`);
  console.log(`📊 Level: ${userLevel} (XP: ${userExperience})`);
  console.log(`💎 Points: ${currentPointsBalance}`);
  console.log(`🚫 Account Banned: ${userIsBanned ? 'YES' : 'NO'}`);
  if (userIsBanned) {
    console.log(`⚠️ WARNING: YOUR ACCOUNT IS BANNED ⚠️`);
  }
  if (hasClaimedSuccessfully) {
    console.log(`✅ CLAIM STATUS: Already claimed successfully once`);
  }
  console.log('');
  console.log('=========================================');
}

async function getUserProfile() {
  try {
    const profileResponse = await axios.put('https://api.clashofcoins.co/api/user', {}, {
      headers: {
        'authorization': AUTH_TOKEN,
        'content-type': 'application/json'
      }
    });
    
    if (profileResponse.data) {
      userNickname = profileResponse.data.nickname || 'Unknown';
      userLevel = profileResponse.data.level || 0;
      userExperience = profileResponse.data.experience || 0;
      userIsBanned = profileResponse.data.isBanned || false;
      
      logMessage(`Updated profile - Nickname: ${userNickname}, Level: ${userLevel}, XP: ${userExperience}, Banned: ${userIsBanned}`, false);
    }
    
    const pointsResponse = await axios.get('https://api.clashofcoins.co/api/user/points', {
      headers: {
        'authorization': AUTH_TOKEN,
        'content-type': 'application/json'
      }
    });
    
    if (pointsResponse.data !== undefined) {
      currentPointsBalance = pointsResponse.data;
      logMessage(`Updated points balance: ${currentPointsBalance}`, false);
    }
  } catch (error) {
    logMessage(`Error getting user data: ${error.message}`, false);
  }
}

async function checkForRewards() {
  try {
    await getUserProfile();
    
    if (hasClaimedSuccessfully) {
      const response = await axios.get('https://api.clashofcoins.co/api/game-server/gamedrop', {
        headers: {
          'authorization': AUTH_TOKEN,
          'content-type': 'application/json'
        }
      });
      
      const data = response.data;
      if (data && data.formattedTimeUntilNextClaim) {
        displayCountdown(data.formattedTimeUntilNextClaim);
      } else {
        displayCountdown("Unknown (already claimed once)");
      }
      return;
    }
    
    const response = await axios.get('https://api.clashofcoins.co/api/game-server/gamedrop', {
      headers: {
        'authorization': AUTH_TOKEN,
        'content-type': 'application/json'
      }
    });

    const data = response.data;
    
    if (data && data.canClaim && !hasClaimedSuccessfully) {
      displayReadyToClaim();
      logMessage(`Rewards are available! Attempting to claim...`, false);
      await claimRewards();
    } else if (data && data.formattedTimeUntilNextClaim) {
      displayCountdown(data.formattedTimeUntilNextClaim);
    } else {
      logMessage(`No rewards available at this time. No countdown information available.`, false);
    }
  } catch (error) {
    logMessage(`Error checking for rewards: ${error.message}`, false);
  }
}

async function claimRewards() {
  if (hasClaimedSuccessfully) {
    logMessage("Skipping claim as we've already claimed successfully once", true);
    return;
  }
  
  try {
    const claimResponse = await axios.put('https://api.clashofcoins.co/api/gamedrops/claim', {}, {
      headers: {
        'authorization': AUTH_TOKEN,
        'content-type': 'application/json'
      }
    });

    const { points, coins, signature } = claimResponse.data;
    logMessage(`Got claim data - Points: ${points}, Coins: ${coins}`, false);

    if (!points || !coins || !signature) {
      logMessage(`Missing required claim data. Aborting.`, false);
      return;
    }

    const gasPrice = await provider.getGasPrice();
    const adjustedGasPrice = gasPrice.mul(120).div(100); 

    const tx = await contract.claimRewards(
      points,
      coins,
      signature,
      {
        gasLimit: 150000, 
        gasPrice: adjustedGasPrice
      }
    );

    logMessage(`Transaction sent! Hash: ${tx.hash}`, true);
    console.log(`Transaction sent! Hash: ${tx.hash}`);
    console.log('Waiting for confirmation...');

    const receipt = await tx.wait(1);
    logMessage(`Transaction confirmed! Gas used: ${receipt.gasUsed.toString()}`, true);
    console.log(`Transaction confirmed! Gas used: ${receipt.gasUsed.toString()}`);
    console.log('Claim successful! ✅');
    
    hasClaimedSuccessfully = true;
    logMessage("Claim successful! Bot will not attempt to claim again in this session.", true);
    
    updateStats(points, coins);
    
    await getUserProfile();
    
    await new Promise(resolve => setTimeout(resolve, 5000));
  } catch (error) {
    logMessage(`Error claiming rewards: ${error.message}`, true);
    console.log(`Error claiming rewards: ${error.message}`);
    if (error.response) {
      logMessage(`API Response: ${JSON.stringify(error.response.data)}`, false);
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

function updateStats(points, coins) {
  let stats = { totalPoints: 0, totalCoins: 0, claimCount: 0, lastClaim: null };
  
  if (fs.existsSync('stats.json')) {
    stats = JSON.parse(fs.readFileSync('stats.json', 'utf8'));
  }
  
  stats.totalPoints += points;
  stats.totalCoins += coins;
  stats.claimCount += 1;
  stats.lastClaim = new Date().toISOString();
  
  fs.writeFileSync('stats.json', JSON.stringify(stats, null, 2));
  logMessage(`Stats updated: Total Points: ${stats.totalPoints}, Total Coins: ${stats.totalCoins}, Claims: ${stats.claimCount}`, false);
}

async function main() {
  try {
    const address = await wallet.getAddress();
    const balance = await provider.getBalance(address);
    
    await getUserProfile();
    
    clearConsole();
    console.log('=============================================');
    console.log('  CLASH OF COINS CLAIM BOT - HRITIK PRO');
    console.log('=============================================');
    console.log('');
    console.log(`Wallet: ${address}`);
    console.log(`Balance: ${ethers.utils.formatEther(balance)} ETH`);
    console.log(`Target contract: ${CONTRACT_ADDRESS}`);
    console.log(`👤 Nickname: ${userNickname}`);
    console.log(`📊 Level: ${userLevel} (XP: ${userExperience})`);
    console.log(`💎 Points: ${currentPointsBalance}`);
    console.log(`🚫 Account Banned: ${userIsBanned ? 'YES' : 'NO'}`);
    if (userIsBanned) {
      console.log(`⚠️ WARNING: YOUR ACCOUNT IS BANNED ⚠️`);
    }
    console.log('');
    console.log('Initializing and checking for rewards...');
    console.log('');
    console.log('=========================================');
    
    logMessage(`Bot started!`, false);
    logMessage(`Wallet: ${address}`, false);
    logMessage(`Balance: ${ethers.utils.formatEther(balance)} ETH`, false);
    logMessage(`Target contract: ${CONTRACT_ADDRESS}`, false);
    logMessage(`User: ${userNickname}, Level: ${userLevel}, XP: ${userExperience}, Points: ${currentPointsBalance}, Banned: ${userIsBanned}`, false);
    
    await checkForRewards(); 
    
    setInterval(checkForRewards, CHECK_INTERVAL);
  } catch (error) {
    logMessage(`Initialization error: ${error.message}`, true);
    console.error(`Initialization error: ${error.message}`);
    process.exit(1);
  }
}

// Start the bot
main().catch(error => {
  logMessage(`Critical error: ${error.message}`, true);
  console.error(`Critical error: ${error.message}`);
  process.exit(1);
});
