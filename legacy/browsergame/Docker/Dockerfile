# https://docs.docker.com/engine/examples/dotnetcore/#create-a-dockerfile-for-an-aspnet-core-application
FROM microsoft/dotnet:aspnetcore-runtime

RUN apt-get update && \
    apt-get install -y libunwind8 && \
	apt-get clean && \
	rm -rf /var/lib/apt/lists/*

# copy bins to docker - we have to go back a dir since artifacts are in root dir
RUN mkdir -p /app
COPY . app/

# expose http service
EXPOSE 80

# run nancy app
WORKDIR /app
CMD [ "dotnet", "./ApiServer.dll"]