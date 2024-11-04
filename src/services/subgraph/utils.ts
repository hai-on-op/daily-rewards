import Axios from "axios";
import { config } from "../../config";
import { UserAccount, UserList } from "../../types";

export const subgraphQueryPaginated = async (
  query: string,
  paginatedField: string,
  url: string
): Promise<any> => {
  const ret: any[] = [];
  let skip = 0;
  do {
    const paginatedQuery = query.replace("[[skip]]", skip.toString());
    const data = await subgraphQuery(paginatedQuery, url);

    ret.push(...data[paginatedField]);
    skip = data[paginatedField].length >= 1000 ? skip + 1000 : 0;
  } while (skip);

  return ret;
};

let i = 0

export const subgraphQuery = async (
  query: string,
  url: string
): Promise<any> => {

 // console.log('quering: ', i++)

  const prom = Axios.post(url, {
    query,
  });

  let resp: any;
  try {
    resp = await prom;
  } catch (err) {
    throw Error("Error with subgraph query: " + err);
  }

  if (!resp.data || !resp.data.data) {
    if (resp.data && resp.data.errors) {
      console.log(resp.data.errors);
    }

    throw Error("No data");
  }

  return resp.data.data;
};
