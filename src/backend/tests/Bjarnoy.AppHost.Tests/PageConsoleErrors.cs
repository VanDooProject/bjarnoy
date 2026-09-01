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
    /// How many recent failed HTTP responses to remember for correlating
    /// against a "Failed to load resource" console message — Chrome's own
    /// console text for that never includes the URL or status, only this
    /// fixed prefix, which otherwise makes every such failure indistinguishable
    /// (see the aspire-e2e flakes this was added to actually diagnose: the
    /// assertion failure message alone gave no way to tell which request, on
    /// which page, ever failed).
    /// </summary>
    private const int RecentFailedResponsesCapacity = 5;

    /// <summary>
    /// Starts collecting this page's console errors and uncaught page
    /// errors. Assert the returned list is empty once the test is done
    /// driving the page. A "Failed to load resource" entry has the URL and
    /// status of the most recently observed failed HTTP response appended,
    /// when one is available — Chrome's own console text for that message
    /// never includes either.
    /// </summary>
    public static List<string> CollectConsoleErrors(this IPage page)
    {
        var errors = new List<string>();
        var recentFailedResponses = new List<string>();

        page.Response += (_, response) =>
        {
            if (response.Ok)
            {
                return;
            }

            if (recentFailedResponses.Count >= RecentFailedResponsesCapacity)
            {
                recentFailedResponses.RemoveAt(0);
            }

            recentFailedResponses.Add($"{response.Url} ({response.Status} {response.StatusText})");
        };

        page.RequestFailed += (_, request) =>
        {
            if (recentFailedResponses.Count >= RecentFailedResponsesCapacity)
            {
                recentFailedResponses.RemoveAt(0);
            }

            recentFailedResponses.Add($"{request.Url} ({request.Failure})");
        };

        page.Console += (_, msg) =>
        {
            if (msg.Type != "error")
            {
                return;
            }

            var text = msg.Text.StartsWith("Failed to load resource", StringComparison.Ordinal)
                && recentFailedResponses.Count > 0
                ? $"{msg.Text} — most recently observed failed request(s): {string.Join(", ", recentFailedResponses)}"
                : msg.Text;
            errors.Add(text);
        };
        page.PageError += (_, err) => errors.Add(err);
        return errors;
    }
}
