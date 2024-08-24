import ReadableZupraStream from "./ReadableZupraStream";

 async function ZupraResponse(basePath = "", headers: Record<string, any>, payload: Record<string, any>):Promise<Response> { 

    const streamReader = new ReadableZupraStream(
        basePath,
        headers,
        payload
      );

    return new Response(await streamReader.fetch())
}

export default ZupraResponse
