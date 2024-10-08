import { DependencyList, EffectCallback, useState } from "react";

import { useEffectAsync } from "./useEffectAsync";

type ResponseTypes = "raw" | "arrayBuffer" | "blob" | "formData" | "text" | "json";

type _Response = globalThis.Response;

type UseFetchProps<TResponseType extends ResponseTypes = ResponseTypes> = {
    url: string | URL | RequestInfo;
    /**
     * Indicates how to process the response
     */
    responseType: TResponseType;
} & Omit<RequestInit, "signal">;

type Response<TResponseType extends ResponseTypes> = TResponseType extends "raw" ? _Response :
    Omit<_Response, "bodyUsed" | "body" | "arrayBuffer" | "blob" | "formData" | "json" | "text" | "clone"> & {
        body: (
            TResponseType extends "json" ? Awaited<ReturnType<_Response["json"]>> :
            TResponseType extends "arrayBuffer" ? Awaited<ReturnType<_Response["arrayBuffer"]>> :
            TResponseType extends "blob" ? Awaited<ReturnType<_Response["blob"]>> :
            TResponseType extends "formData" ? Awaited<ReturnType<_Response["formData"]>> :
            TResponseType extends "text" ? Awaited<ReturnType<_Response["text"]>> : unknown
        );
    };

/**
 * Represents a core fetch request
 * @param param0 standard `fetch` props
 * @param deps Dependency list
 * @param destructor destructor
 * @returns [ loading, `Response`, Error ]
 */
export function useFetch<
    TResponseType extends ResponseTypes = ResponseTypes
    >(
    { url, responseType, ...init }: UseFetchProps<TResponseType>,
    deps?: DependencyList,
    destructor?: ReturnType<EffectCallback>) : [ boolean, Response<TResponseType>, any ]
    {
    const [ response, setResponse ] = useState<Response<TResponseType>>(incompleteResponse(url, responseType));
    const [ error, setError ] = useState<any>();

    const loading = useEffectAsync(async (signal) => {
        setResponse(incompleteResponse(url, responseType));
        setError(null);

        try {
            const fetchResponse = await fetch(url, {
                ...init,
                signal
            });

            // short-circuit to prevent further processing
            if (signal.aborted) {
                return;
            }

            if (responseType === "raw" || !response.ok) {
                // pass-through: no further processing
                setResponse(fetchResponse as any);
            } else {
                let body: any = null;
                try {
                    switch (responseType) {
                        case "arrayBuffer":
                            body = await fetchResponse.arrayBuffer();
                            break;
                        case "blob":
                            body = await fetchResponse.blob();
                            break;
                        case "formData":
                            body = await fetchResponse.formData();
                            break;
                        case "text":
                            body = await fetchResponse.text();
                            break;
                        case "json":
                            body = await fetchResponse.json();
                            break;
                    }
                } catch {
                    // swallow this error
                    // technically, this should only happen if we are parsing the wrong response type or there is no body
                }

                setResponse({
                    ok: fetchResponse.ok,
                    headers: fetchResponse.headers,
                    redirected: fetchResponse.redirected,
                    status: fetchResponse.status,
                    statusText: fetchResponse.statusText,
                    type: fetchResponse.type,
                    url: fetchResponse.url,
                    body: body
                } as Response<TResponseType>);
            }
        }
        catch (e) {
            if (!signal.aborted) {
                setError(e);
            }
        }
    }, deps, destructor);

    return [ loading, response, error ];
}

/**
 * Generates a fake response object to prevent null exceptions on initial deconstruction
 * @param url 
 * @param responseType 
 * @returns 
 */
function incompleteResponse<
    TResponseType extends ResponseTypes = ResponseTypes
    >(url: string | URL | RequestInfo, responseType: TResponseType): Response<TResponseType> {

    const res: any = {
        headers: new Headers(),
        ok: false,
        redirected: false,
        status: 0,
        statusText: "LOADING",
        type: "default",
        url: toUrlString(url),
        body: null,
    } as Response<TResponseType>;

    if (responseType === "raw") {
        return {
            ...res,
            bodyUsed: false,
            arrayBuffer: noopAsync,
            blob: noopAsync,
            formData: noopAsync,
            json: noopAsync,
            text: noopAsync,
            clone: () => incompleteResponse(url, responseType) as _Response,
        } satisfies _Response as any;
    }

    return res;
}

function noopAsync(): any {
    return Promise.resolve();
}

function toUrlString(url: string | URL | RequestInfo) {
    if (url instanceof URL) {
        return url.toString();
    } else if (url instanceof Request) {
        return url.url;
    } else {
        return url;
    }
}