import { Chain } from "@covalenthq/client-sdk";
import * as fs from 'fs';
import * as path from 'path';
import {config} from '../../config/index';



export const API_KEY: string = config().COVALENT_API_KEY;
export const CHAIN_ID: Chain = config().CHAIN_ID as Chain;
export const STANDARD_BRIDGE_ADDRESS: string = config().STANDARD_BRIDGE_ADDRESS;
export const LZ_EXECUTOR_ADDRESS: string = config().LZ_EXECUTOR_ADDRESS;
export const CROSS_DOMAIN_MESSENGER_ADDRESS: string = config().CROSS_DOMAIN_MESSENGER_ADDRESS;
export const APX_ETH_ADDRESS: string = config().APX_ETH_ADDRESS;
export const RETH_CONTRACT_ADDRESS: string = config().RETH_CONTRACT_ADDRESS;
export const WSTETH_CONTRACT_ADDRESS: string = config().WSTETH_CONTRACT_ADDRESS;
export const HOP_PROTOCOL_RETH_WRAPPER = config().HOP_PROTOCOL_RETH_WRAPPER;
