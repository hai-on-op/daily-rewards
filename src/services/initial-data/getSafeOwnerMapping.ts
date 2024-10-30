import { subgraphQueryPaginated } from "../subgraph/utils";
import { config } from "../../config";

export const getSafeOwnerMapping = async (block: number) => {
  let owners = new Map<string, string>();
  const query = `{
        safeHandlerOwners(first: 1000, skip: [[skip]], block: {number: ${block}}) {
          id
          owner {
            address
          }
        }
      }`;

  const res: {
    id: string;
    owner: { address: string };
  }[] = await subgraphQueryPaginated(
    query,
    "safeHandlerOwners",
    config().GEB_SUBGRAPH_URL
  );

  for (let a of res) {
    owners.set(a.id, a.owner.address);
  }
  return owners;
};
