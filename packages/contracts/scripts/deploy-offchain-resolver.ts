import { readFileSync } from 'fs';
import solc from 'solc';
import { createWalletClient, http } from 'viem';
import { mainnet } from 'viem/chains';

const rpcUrl =
  process.env.ETH_RPC_URL || (process.env.ALCHEMY_API_KEY
    ? `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
    : undefined);

const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
const signerAddress = process.env.ENS_CCIP_SIGNER_ADDRESS;
const gatewayUrl = process.env.ENS_CCIP_GATEWAY_URL;

if (!rpcUrl) {
  throw new Error('Missing ETH_RPC_URL or ALCHEMY_API_KEY');
}

if (!deployerKey) {
  throw new Error('Missing DEPLOYER_PRIVATE_KEY');
}

if (!signerAddress) {
  throw new Error('Missing ENS_CCIP_SIGNER_ADDRESS');
}

if (!gatewayUrl) {
  throw new Error('Missing ENS_CCIP_GATEWAY_URL');
}

const source = readFileSync(
  new URL('../contracts/UniforumOffchainResolver.sol', import.meta.url),
  'utf-8'
);

const input = {
  language: 'Solidity',
  sources: {
    'UniforumOffchainResolver.sol': { content: source },
  },
  settings: {
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode'],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = output.errors?.filter((err: any) => err.severity === 'error');
if (errors?.length) {
  throw new Error(errors.map((err: any) => err.formattedMessage).join('\n'));
}

const contract = output.contracts['UniforumOffchainResolver.sol'].UniforumOffchainResolver;
const abi = contract.abi;
const bytecode = `0x${contract.evm.bytecode.object}`;

const client = createWalletClient({
  chain: mainnet,
  transport: http(rpcUrl),
  account: deployerKey as `0x${string}`,
});

const hash = await client.deployContract({
  abi,
  bytecode,
  args: [signerAddress, [gatewayUrl]],
});

console.log('Deploy tx:', hash);
console.log('Wait for confirmation, then set ENS resolver to the deployed address.');
