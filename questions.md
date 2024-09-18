Are we sure that the current code bases are working properly?

`{safes(where: {debt_gt: 0}, first: 1000, skip: [[skip]],block: {number:${startBlock}}) {debt, safeHandler, collateralType {id}}}

Here it seems that block: startBlock should get the safes from startBlock till now, but it means to just get safes that are created at the startBlock