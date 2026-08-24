FROM mcr.microsoft.com/dotnet/aspnet:9.0
WORKDIR /app
COPY src/BG.API/bin/Release/net9.0/publish/ .
#EXPOSE 80
#EXPOSE 443s
EXPOSE 8080
ENTRYPOINT ["dotnet", "BG.API.dll"]