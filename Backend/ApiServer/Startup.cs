using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using ApiServer.Authorization;
using CoreClassLibrary.Observer;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
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
                });

            services.AddMvc();

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
        }


        // This method gets called by the runtime. Use this method to configure the HTTP request pipeline.
        public void Configure(IApplicationBuilder app, IHostingEnvironment env)
        {
            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
            }

            // enable auth - source (same as above) https://auth0.com/blog/securing-asp-dot-net-core-2-applications-with-jwts/
            app.UseAuthentication();

            // https://stackoverflow.com/questions/44379560/how-to-enable-cors-in-asp-net-core-webapi
            app.UseCors(builder => builder
                .AllowAnyOrigin()
                .AllowAnyMethod()
                .AllowAnyHeader()
                .AllowCredentials());

            // https://docs.microsoft.com/en-us/aspnet/core/fundamentals/static-files?view=aspnetcore-2.1&tabs=aspnetcore2x
            app.UseDefaultFiles();
            app.UseStaticFiles();

            // Enable middleware to serve generated Swagger as a JSON endpoint.
            app.UseSwagger();

            // Enable middleware to serve swagger-ui (HTML, JS, CSS, etc.), 
            // specifying the Swagger JSON endpoint.
            app.UseSwaggerUI(c =>
            {
                c.SwaggerEndpoint("/swagger/v1/swagger.json", "Browsergame API V1");
            });

            app.UseMvc();

            QueueObserver.Instance.ToString();
        }
    }
}
