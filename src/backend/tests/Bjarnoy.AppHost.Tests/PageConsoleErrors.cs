using Microsoft.Playwright;

namespace Bjarnoy.AppHost.Tests;

/// <summary>
/// Every AppHost Playwright test drives a real browser against the real
/// frontend, so it should fail loudly on a console error rather than
/// silently pass while the UI quietly does nothing — that's exactly how the
/// bootstrapLiveWorld() bug <see cref="FoundingSettlementPersistenceTests"/>
/// guards against actually showed up in practice (a swallowed 409 from
/// creating a world that already existed).
/// </summary>
public static class PageConsoleErrors
{
    /// <summary>
    /// Starts collecting this page's console errors and uncaught page
    /// errors. Assert the returned list is empty once the test is done
    /// driving the page.
    /// </summary>
    public static List<string> CollectConsoleErrors(this IPage page)
    {
        var errors = new List<string>();
        page.Console += (_, msg) =>
        {
            if (msg.Type == "error") errors.Add(msg.Text);
        };
        page.PageError += (_, err) => errors.Add(err);
        return errors;
    }
}
