using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Claims;
using System.Text;
using System.Threading.Tasks;
using ApiServer.Authorization;
using ApiServer.BackgroundService;
using ApiServer.SignalRHubs;
using CoreClassLibrary.Observer;
using log4net;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Microsoft.Net.Http.Headers;
using Microsoft.OpenApi.Models;

namespace ApiServer
{
    public class Startup
    {
        public IConfiguration Configuration { get; }


        public Startup(IConfiguration configuration)
        {
            Configuration = configuration;
        }



        // This method gets called by the runtime. Use this method to add services to the container.
        public void ConfigureServices(IServiceCollection services)
        {
            // add JWT authentication
            // from https://auth0.com/blog/securing-asp-dot-net-core-2-applications-with-jwts/
            // added comments from https://developer.okta.com/blog/2018/03/23/token-authentication-aspnetcore-complete-guide
            services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
                .AddJwtBearer(options =>
                {
                    options.TokenValidationParameters = new TokenValidationParameters
                    {
                        // Clock skew compensates for server time drift.
                        // We recommend 5 minutes or less:
                        ClockSkew = TimeSpan.FromMinutes(1),

                        // Ensure the token hasn't expired:
                        RequireExpirationTime = true,
                        ValidateLifetime = true, // check that the token is not expired and that the signing key of the issuer is valid

                        // Ensure the token audience matches our audience value (default true):
                        ValidateAudience = true, // ensure that the recipient of the token is authorized to receive it 
                        ValidAudience = Configuration["Jwt:Issuer"], // <- taken from appsettings.json

                        // Ensure the token was issued by a trusted authorization server (default true):
                        ValidateIssuer = true, // validate the server that created that token
                        ValidIssuer = Configuration["Jwt:Issuer"], // <- taken from appsettings.json

                        // ?? signing key stuff
                        ValidateIssuerSigningKey = true, // verify that the key used to sign the incoming token is part of a list of trusted keys
                        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Configuration["Jwt:Key"]))
                    };

                    // https://docs.microsoft.com/en-us/aspnet/core/signalr/authn-and-authz?view=aspnetcore-2.2
                    // We have to hook the OnMessageReceived event in order to
                    // allow the JWT authentication handler to read the access
                    // token from the query string when a WebSocket or 
                    // Server-Sent Events request comes in.
                    options.Events = new JwtBearerEvents
                    {
                        OnMessageReceived = context =>
                        {
                            var accessToken = context.Request.Query["access_token"];

                            // If the request is for our hub...
                            var path = context.HttpContext.Request.Path;
                            if (!string.IsNullOrEmpty(accessToken) &&
                                (path.StartsWithSegments("/api/ws")))
                            {
                                // Read the token out of the query string
                                context.Token = accessToken;
                            }
                            return Task.CompletedTask;
                        }
                    };
                });

            services.AddMvc();

            // https://www.codemag.com/Article/1807061/Build-Real-time-Applications-with-ASP.NET-Core-SignalR
            services.AddSignalR();

            // to map our user objects to ids
            services.AddSingleton<IUserIdProvider, CustomUserIdProvider>();

            // TODO: only for debug builds (to prevent data(API specification) leaks)
            // Register the Swagger generator, defining 1 or more Swagger documents
            services.AddSwaggerGen(c =>
            {
                c.SwaggerDoc("v1", new OpenApiInfo { Title = "Browsergame API", Version = "v1" });

                // Set the comments path for the Swagger JSON and UI.
                var xmlFile = $"{Assembly.GetExecutingAssembly().GetName().Name}.xml";
                var xmlPath = Path.Combine(AppContext.BaseDirectory, xmlFile);
                c.IncludeXmlComments(xmlPath);
            });

            // https://docs.microsoft.com/en-us/aspnet/core/security/authorization/policies?view=aspnetcore-2.1
            services.AddAuthorization(options =>
            {
                options.AddPolicy("ValidSession", policy =>
                    policy.Requirements.Add(new ValidSessionRequirement()
                    ));
            });

            services.AddSingleton<IAuthorizationHandler, SessionAuthorizationHandler>();




            // add Queue Observer service
            services.AddHostedService<QueueObserverService>();
        }


        // This method gets called by the runtime. Use this method to configure the HTTP request pipeline.
        public void Configure(IApplicationBuilder app, IHostingEnvironment env)
        {
            // TODO refactor this to own class
            ILog logger = LogManager.GetLogger(typeof(Startup)); //GetLogger("WebServer", "Requests");
            app.Use(async (context, next) =>
            {
                // Do logging
                // Do work that doesn't write to the Response.
                await next.Invoke();
                // Do logging or other work that doesn't write to the Response.

                string userId = context.User.FindFirst(c => c.Type == ClaimTypes.NameIdentifier)?.Value;

                logger.InfoFormat("{0} {1} \"{2} {3}\"\t#{4} {5}",
                    context.Connection.RemoteIpAddress,
                    context.Response.StatusCode/* + " = " + ReasonPhrases.GetReasonPhrase(context.Response.StatusCode)*/,
                    context.Request.Method, context.Request.Path+context.Request.QueryString,
                    userId,
                    context.Request.Headers[HeaderNames.UserAgent]
                );
            });


            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
            }

            // enable auth - source (same as above) https://auth0.com/blog/securing-asp-dot-net-core-2-applications-with-jwts/
            app.UseAuthentication();

            // https://stackoverflow.com/questions/44379560/how-to-enable-cors-in-asp-net-core-webapi
            // TODO: remove core on release builds
            app.UseCors(builder => builder
                //.AllowAnyOrigin()
                .WithOrigins("http://localhost:8080")
                .AllowAnyMethod()
                .AllowAnyHeader()
                .AllowCredentials());

            // https://docs.microsoft.com/en-us/aspnet/core/fundamentals/static-files?view=aspnetcore-2.1&tabs=aspnetcore2x
            app.UseDefaultFiles();
            app.UseStaticFiles();

            // https://www.codemag.com/Article/1807061/Build-Real-time-Applications-with-ASP.NET-Core-SignalR
            app.UseSignalR(builder =>
            {
                builder.MapHub<BaseHub>("/api/ws");
            });

            // Enable middleware to serve generated Swagger as a JSON endpoint.
            app.UseSwagger();

            // Enable middleware to serve swagger-ui (HTML, JS, CSS, etc.), 
            // specifying the Swagger JSON endpoint.
            app.UseSwaggerUI(c =>
            {
                c.SwaggerEndpoint("/swagger/v1/swagger.json", "Browsergame API V1");
            });

            app.UseMvc();
        }
    }
}
