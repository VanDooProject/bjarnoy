using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Buildings;

/// <summary>
/// Linked realms (<c>docs/design/economy.md</c> section 5, "Linked realms share their stores"): two settlements of one
/// player on one island are linked when their realms touch, i.e. some claimed hex of one equals or shares an edge with
/// some claimed hex of the other. Linking is transitive, so the settlements fall into connected components.
/// </summary>
/// <remarks>
/// Pure. A member's claimed hexes are the hexes of its <see cref="ConnectedRealm.DiscsOf"/> discs (longhouse disc plus
/// connected towers' discs) after the giant rule (<see cref="Territory.Claims"/>): a giant's 7 hexes count only when all
/// are covered by that member's own discs.
/// </remarks>
public static class LinkedGroups
{
    /// <summary>
    /// The components of <paramref name="oldestFirst"/> (the player's settlements on one island, oldest first), each
    /// oldest-first, ordered by their oldest member. <paramref name="realm"/> is the connected realm of that whole set.
    /// </summary>
    public static IReadOnlyList<IReadOnlyList<Guid>> Components(
        ConnectedRealm realm, IReadOnlyList<Guid> oldestFirst, IGiantIndex giants)
    {
        ArgumentNullException.ThrowIfNull(realm);
        ArgumentNullException.ThrowIfNull(oldestFirst);
        ArgumentNullException.ThrowIfNull(giants);

        var n = oldestFirst.Count;
        var parent = Enumerable.Range(0, n).ToArray();
        int Find(int x)
        {
            while (parent[x] != x)
            {
                parent[x] = parent[parent[x]];
                x = parent[x];
            }

            return x;
        }

        var discs = oldestFirst.Select(realm.DiscsOf).ToArray();
        var hexes = new IReadOnlySet<HexCoord>?[n];
        IReadOnlySet<HexCoord> HexesOf(int i) => hexes[i] ??= ClaimedHexes(discs[i], giants);

        for (var i = 0; i < n; i++)
        {
            for (var j = i + 1; j < n; j++)
            {
                if (Find(i) == Find(j) || !DiscsMayTouch(discs[i], discs[j]))
                {
                    continue;
                }

                if (Touch(HexesOf(i), HexesOf(j)))
                {
                    var (ri, rj) = (Find(i), Find(j));
                    // The smaller index is the older member, so it stays the root.
                    parent[Math.Max(ri, rj)] = Math.Min(ri, rj);
                }
            }
        }

        // Indices ascend, so both the roots and the members come out oldest-first.
        var groups = new Dictionary<int, List<Guid>>();
        var result = new List<IReadOnlyList<Guid>>();
        for (var i = 0; i < n; i++)
        {
            var root = Find(i);
            if (!groups.TryGetValue(root, out var members))
            {
                members = [];
                groups[root] = members;
                result.Add(members);
            }

            members.Add(oldestFirst[i]);
        }

        return result;
    }

    /// <summary>The hexes <paramref name="discs"/> claim, after the giant rule.</summary>
    public static IReadOnlySet<HexCoord> ClaimedHexes(
        IReadOnlyList<(HexCoord Centre, int Radius)> discs, IGiantIndex giants)
    {
        ArgumentNullException.ThrowIfNull(discs);
        ArgumentNullException.ThrowIfNull(giants);

        var result = new HashSet<HexCoord>();
        foreach (var (centre, radius) in discs)
        {
            foreach (var hex in centre.WithinRadius(radius))
            {
                if (!result.Contains(hex) && Territory.Claims(discs, hex, giants))
                {
                    result.Add(hex);
                }
            }
        }

        return result;
    }

    /// <summary>Whether some hex of <paramref name="a"/> equals or shares an edge with some hex of <paramref name="b"/>.</summary>
    public static bool Touch(IReadOnlySet<HexCoord> a, IReadOnlySet<HexCoord> b)
    {
        ArgumentNullException.ThrowIfNull(a);
        ArgumentNullException.ThrowIfNull(b);

        var (small, large) = a.Count <= b.Count ? (a, b) : (b, a);
        foreach (var hex in small)
        {
            if (large.Contains(hex) || hex.Neighbours().Any(large.Contains))
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>
    /// For world lists: <paramref name="rows"/> of many players and islands (<c>Key</c> = the player-and-island key).
    /// Returns each settlement's realm id, the id of the oldest member (<c>FoundedAt</c>, then <c>Id</c>) of its component.
    /// </summary>
    public static IReadOnlyDictionary<Guid, Guid> RealmIds<TKey>(
        IEnumerable<(TKey Key, RealmSettlement Settlement, DateTimeOffset FoundedAt)> rows, IGiantIndex giants)
        where TKey : notnull
    {
        ArgumentNullException.ThrowIfNull(rows);
        ArgumentNullException.ThrowIfNull(giants);

        var result = new Dictionary<Guid, Guid>();
        foreach (var group in rows.GroupBy(r => r.Key))
        {
            var ordered = group.OrderBy(r => r.FoundedAt).ThenBy(r => r.Settlement.Id).ToList();
            var realm = ConnectedRealm.Resolve(ordered.Select(r => r.Settlement));
            var ids = ordered.Select(r => r.Settlement.Id).ToList();
            foreach (var component in Components(realm, ids, giants))
            {
                foreach (var id in component)
                {
                    result[id] = component[0];
                }
            }
        }

        return result;
    }

    // A link needs some disc pair within ra + rb + 1 of each other; anything further apart cannot touch.
    private static bool DiscsMayTouch(
        IReadOnlyList<(HexCoord Centre, int Radius)> a, IReadOnlyList<(HexCoord Centre, int Radius)> b)
    {
        foreach (var da in a)
        {
            foreach (var db in b)
            {
                if (da.Centre.DistanceTo(db.Centre) <= da.Radius + db.Radius + 1)
                {
                    return true;
                }
            }
        }

        return false;
    }
}
