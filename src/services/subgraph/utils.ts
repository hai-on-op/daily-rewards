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

let i = 0;

export const subgraphQuery = async (
  query: string,
  url: string
): Promise<any> => {
  // Debug logging for troubleshooting subgraph queries
  const DEBUG_SUBGRAPH = process.env.DEBUG_SUBGRAPH === 'true' || process.env.DEBUG_SUBGRAPH === '1';
  
  if (DEBUG_SUBGRAPH) {
    console.log('\n========== SUBGRAPH QUERY DEBUG ==========');
    console.log('URL:', url);
    console.log('Query:', query);
    console.log('===========================================\n');
  }

  const prom = Axios.post(url, {
    query,
  });

  let resp: any;
  try {
    resp = await prom;
  } catch (err: any) {
    if (DEBUG_SUBGRAPH) {
      console.log('\n========== SUBGRAPH QUERY ERROR ==========');
      console.log('URL:', url);
      console.log('Query:', query);
      console.log('Error:', err.message);
      if (err.response) {
        console.log('Status:', err.response.status);
        console.log('Response data:', JSON.stringify(err.response.data, null, 2));
      }
      console.log('===========================================\n');
    }
    throw Error("Error with subgraph query: " + err);
  }

  if (!resp.data || !resp.data.data) {
    if (DEBUG_SUBGRAPH) {
      console.log('\n========== SUBGRAPH NO DATA ERROR ==========');
      console.log('URL:', url);
      console.log('Query:', query);
      console.log('Response:', JSON.stringify(resp.data, null, 2));
      console.log('============================================\n');
    }
    if (resp.data && resp.data.errors) {
      console.log(resp.data.errors);
    }

    throw Error("No data");
  }

  return resp.data.data;
};
