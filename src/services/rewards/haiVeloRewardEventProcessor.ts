import {
  getStakingPositions,
  calculateStakingAtTimestamp,
  StakingPostion,
  StakingState
} from '../skite-data';

import { HaiveloCollateralEvent } from '../initial-data/getInitialHaiveloState';
import { UserAccount, UserList } from '../../types';
import { config } from '../../config';
import { haiveloProvider } from '../../utils/chain';
import { getOrCreateUserMutate } from '../../utils';

type BoostAmounts = Record<string, number>;

type ProcessorOptions = {
  startBlock: number;
  endBlock: number;
};

type BoostConfig = { bias: number; cap: number };

type HaiVeloProcessorParams = {
  version: 'v1' | 'v2';
  boostConfig?: BoostConfig; // default from config
  denominatorMode?: 'combined' | 'perVersion'; // default from config
  denominatorUsers?: UserList; // optional combined users snapshot for denominator calculations
};

export const processRewardEvents = async (
  rewardAmount: number,
  events: HaiveloCollateralEvent[],
  users: UserList,
  options?: ProcessorOptions,
  params?: HaiVeloProcessorParams
): Promise<UserList> => {
  const stakingPositions = await getStakingPositions();

  const {
    startBlock = config().HAIVELO_START_BLOCK,
    endBlock = config().HAIVELO_END_BLOCK
  } = options
    ? options
    : {
        startBlock: config().HAIVELO_START_BLOCK,
        endBlock: config().HAIVELO_END_BLOCK
      };

  const startTimestamp = (await haiveloProvider.getBlock(startBlock)).timestamp;
  const endTimestamp = (await haiveloProvider.getBlock(endBlock)).timestamp;

  const rewardRate = rewardAmount / (endTimestamp - startTimestamp);

  let timestamp = startTimestamp;
  const calculateUserhaiVeloBoosts = (users: UserList): BoostAmounts => {
    const stakingState = calculateStakingAtTimestamp(
      stakingPositions,
      timestamp
    );

    const denominatorSource: UserList | undefined =
      (params?.denominatorMode || (config().HAIVELO_BOOST_DENOMINATOR_MODE as 'combined' | 'perVersion')) === 'combined'
        ? params?.denominatorUsers || users
        : users;

    const totalCollatera = Object.values(denominatorSource).reduce(
      (acc, user) => acc + user.collateral,
      0
    );

    return Object.entries(stakingState.users).reduce(
      (pV, cV: Record<string, any>) => {
        const userDeposited = denominatorSource[cV[0]] ? denominatorSource[cV[0]].collateral : 0;

        const userKiteShare = cV[1].share;

        const rawBoost = Math.min(
          userDeposited
            ? userKiteShare /
                ((userDeposited ? userDeposited : 0) / totalCollatera) +
                1
            : 1,
          2
        );

        const bias = params?.boostConfig?.bias ?? (params?.version === 'v2' ? (config().HAIVELO_BOOST_CONFIG?.v2?.bias ?? 1) : (config().HAIVELO_BOOST_CONFIG?.v1?.bias ?? 1));
        const cap = params?.boostConfig?.cap ?? (params?.version === 'v2' ? (config().HAIVELO_BOOST_CONFIG?.v2?.cap ?? 2) : (config().HAIVELO_BOOST_CONFIG?.v1?.cap ?? 2));

        const biasedBoost = 1 + bias * (rawBoost - 1);
        const finalBoost = Math.min(biasedBoost, cap);

        return {
          ...pV,
          [cV[0]]: finalBoost
        };
      },
      {}
    );
  };

  let totalStakingWeight = sumAllWeights(
    users,
    calculateUserhaiVeloBoosts(users)
  );

  let rewardPerWeight = 0; //rewardRate / totalStakingWeight;

  let updateRewardPerWeight = (evtTime: number) => {
    if (totalStakingWeight > 0) {
      const deltaTime = evtTime - timestamp;

      rewardPerWeight += (deltaTime * rewardRate) / totalStakingWeight;
    }
  };

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (i % 1000 === 0 && i > 0) console.log(`  Processed ${i} events`);

    updateRewardPerWeight(Number(event.createdAt));

    timestamp = Number(event.createdAt);

    const user = getOrCreateUserMutate(event.safe.owner.address, users);

    Object.values(users).map(u =>
      earn(u, rewardPerWeight, calculateUserhaiVeloBoosts(users))
    );

    user.collateral += Number(event.deltaCollateral);

    // Ignore Dusty collateral
    if (user.collateral < 0 && user.collateral > -0.4) {
      user.collateral = 0;
    }

    user.stakingWeight = user.collateral;

    const sanityCheckUsers = () => {
      Object.values(users).forEach(user => {
        if (user.earned < 0) {
          throw Error('Earned is negative');
        }
      });
    };

    sanityCheckUsers();

    totalStakingWeight = sumAllWeights(
      users,
      calculateUserhaiVeloBoosts(users)
    );
  }

  updateRewardPerWeight(endTimestamp);

  Object.values(users).map(u =>
    earn(u, rewardPerWeight, calculateUserhaiVeloBoosts(users))
  );

  return users;
};

// Credit reward to a user
const earn = (
  user: UserAccount,
  rewardPerWeight: number,
  boostAmounts: BoostAmounts
) => {
  const boostAmount = boostAmounts[user.address] ?? 1;

  // Credit to the user his due rewards

  user.earned +=
    (rewardPerWeight - user.rewardPerWeightStored) *
    user.stakingWeight *
    boostAmount;
  // Store his cumulative credited rewards for next time
  user.rewardPerWeightStored = rewardPerWeight;
};

const sumAllWeights = (users: UserList, boostAmounts: BoostAmounts) => {
  return Object.values(users).reduce((acc, user) => {
    const boostAmount = boostAmounts[user.address] ?? 1;
    return acc + user.stakingWeight * boostAmount;
  }, 0);
};
