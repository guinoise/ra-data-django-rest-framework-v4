import { stringify } from 'query-string';
import {
  Identifier,
  PaginationPayload,
  SortPayload,
  FilterPayload,
  fetchUtils,
  DataProvider,
} from 'ra-core';

export {
  default as tokenAuthProvider,
  fetchJsonWithAuthToken,
} from './tokenAuthProvider';

export {
  default as jwtTokenAuthProvider,
  fetchJsonWithAuthJWTToken,
} from './jwtTokenAuthProvider';

const getPaginationQuery = (pagination: PaginationPayload) => {
  return {
    page: pagination.page,
    page_size: pagination.perPage,
  };
};

const getFilterQuery = (filter: FilterPayload) => {
  const { q: search, ...otherSearchParams } = filter;
  return {
    ...otherSearchParams,
    search,
  };
};

export const getOrderingQuery = (sort: SortPayload) => {
  const { field, order } = sort;
  return {
    ordering: `${order === 'ASC' ? '' : '-'}${field}`,
  };
};

export default (
  apiUrl: String,
  httpClient: Function = fetchUtils.fetchJson
): DataProvider => {
  const callHttpClientFileHandling = async (
    uri: String,
    method: String,
    data: Partial<any>
  ) => {
    var needFormData = false;
    let body;
    for (const key in data) {
      if (data[key]['rawFile'] && data[key]['rawFile'] instanceof Blob) {
        needFormData = true;
        break;
      }
    }
    if (needFormData === true) {
      body = new FormData();
      for (const key in data) {
        body.append(key, data[key]);
      }
    } else {
      body = JSON.stringify(data);
    }
    return await httpClient(uri, {
      method: method,
      body: body,
    });
  };
  const getUrlForId = (resource: String, id: Identifier) => {
    var url: string | String = `${apiUrl}/${resource}/${id}/`;
    if (typeof id === 'string') {
      if (id.startsWith(`${apiUrl}/${resource}/`)) {
        url = id;
      } else if (id.startsWith(`/${resource}/`)) {
        url = `${apiUrl}${id}`;
      }
    }
    return url;
  };
  const getOneJson = (resource: String, id: Identifier) => {
    return httpClient(getUrlForId(resource, id)).then(
      (response: Response) => response.json
    );
  };
  return {
    getList: async (resource, params) => {
      const query = {
        ...getFilterQuery(params.filter),
        ...getPaginationQuery(params.pagination),
        ...getOrderingQuery(params.sort),
      };
      const url = `${apiUrl}/${resource}/?${stringify(query)}`;

      const { json } = await httpClient(url);

      return {
        data: json.results,
        total: json.count,
      };
    },

    getOne: async (resource, params) => {
      const data = await getOneJson(resource, params.id);
      return {
        data,
      };
    },

    getMany: (resource, params) => {
      return Promise.all(
        params.ids.map(id => getOneJson(resource, id))
      ).then(data => ({ data }));
    },

    getManyReference: async (resource, params) => {
      const query = {
        ...getFilterQuery(params.filter),
        ...getPaginationQuery(params.pagination),
        ...getOrderingQuery(params.sort),
        [params.target]: params.id,
      };
      const url = `${apiUrl}/${resource}/?${stringify(query)}`;

      const { json } = await httpClient(url);
      return {
        data: json.results,
        total: json.count,
      };
    },

    update: async (resource, params) => {
      const { json } = await callHttpClientFileHandling(
        getUrlForId(resource, params.id),
        'PATCH',
        params.data
      );
      return { data: json };
    },

    updateMany: (resource, params) =>
      Promise.all(
        params.ids.map(id =>
          callHttpClientFileHandling(
            getUrlForId(resource, id),
            'PATCH',
            params.data
          )
        )
      ).then(responses => ({ data: responses.map(({ json }) => json.id) })),

    create: async (resource, params) => {
      const { json } = await callHttpClientFileHandling(
        `${apiUrl}/${resource}/`,
        'POST',
        params.data
      );
      return {
        data: { ...json },
      };
    },

    delete: (resource, params) =>
      httpClient(getUrlForId(resource, params.id), {
        method: 'DELETE',
      }).then(() => ({ data: params.previousData })),

    deleteMany: (resource, params) =>
      Promise.all(
        params.ids.map(id =>
          httpClient(getUrlForId(resource, id), {
            method: 'DELETE',
          })
        )
      ).then(() => ({ data: [] })),
  };
};
