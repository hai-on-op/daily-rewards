export interface VeloDepositEvent {
  id: string;
  user: {
    id: string;
    address: string;
  };
  amount: string;
  createdAt: string;
  createdAtBlock: string;
  createdAtTransaction: string;
}

export interface VeloDepositsResponse {
  wrappedTokenDeposits: VeloDepositEvent[];
}

export interface UserDeposit {
  address: string;
  totalAmount: string;
  deposits: VeloDepositEvent[];
}

export type UserDepositsMap = Record<string, UserDeposit>;
