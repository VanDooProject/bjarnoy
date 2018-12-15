using CoreClassLibrary.Models.Map;
using CoreClassLibrary.Models.Map.Biomes;
using CoreClassLibrary.Models.Map.Tiles;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Numerics;
using CoreClassLibrary.Controller;
using log4net;

namespace CoreClassLibrary.Factory
{
    public class IslandFactory
    {
        private ILog logger = LogManager.GetLogger(typeof(IslandFactory));

        private BiomFactory biom_factory = new BiomFactory();

        public Island GetRndIsland(int size, int z)
        {
            Vector3 startPosition = new Vector3(0, 0, z);
            Island island = new Island(startPosition);

            Random rnd = new Random();
            island.name = GenerateRandomName();
            if(size < 10)
            {
                size = 10;
            }
            island.size = rnd.Next(size - 5, size + 5);

            CreateAndAddRndStartBioms(island);
            ExpandBiomsAndCreateTiles(island);
            CreateEdgeBrim(island);

            return island;
        }

        private void CreateEdgeBrim(Island island)
        {
            Biom biom = new EdgeBiom();
            List<Tile> tiles = new List<Tile>();

            foreach (Tile tile in island.Tiles)
            {
                // check neighbor coords, if free try to place edge tile
                List<Vector3> freeNeighbors = getFreeNeighbors(island, tile);

                foreach (Vector3 pos in freeNeighbors)
                {
                    List<Tile> neighbors = getNeighbors(island, pos);
                    
                    Tile newTile = null;
                    // set typ depending on neighbors
                    //int count = neighbors.Count(t => (t as EdgeTile) != null);
                    int count = neighbors.Count(t => !(t is EdgeTile));
                    //int count = neighbors.NotOf(typeof(EdgeTile)).Count;
                    switch (count)
                    {
                        case 0:
                        case 4:
                        case 6:
                        case 7:
                        case 8:
                            logger.ErrorFormat("this is no valid edge tile {0}", tile);
                            break;
                        case 1:
                            newTile = new QuarterEdgeTile(pos);
                            break;
                        case 2:
                        case 3:
                            newTile = new HalfEdgeTile(pos);
                            break;
                        case 5:
                            newTile = new TriQuarterEdgeTile(pos);
                            break;
                    }

                    if (newTile != null)
                    {
                        tiles.Add(newTile);
                    }
                }
            }
            biom.tiles.AddRange(tiles);
            island.bioms.Add(biom);
        }

        private List<Tile> getNeighbors(Island island, Vector3 pos)
        {
            List<Tile> tiles = new List<Tile>();

            for (float x = pos.X - 1; x <= pos.X + 1; x++)
            {
                for (float y = pos.Y - 1; y <= pos.Y + 1; y++)
                {
                    Tile neighbor = getTile(island, new Vector3(x, y, pos.Z));
                    if (neighbor != null)
                    {
                        tiles.Add(neighbor);
                    }
                }
            }

            return tiles;
        }

        private List<Tile> getNeighbors(Island island, Tile tile)
        {
            return getNeighbors(island, tile.Position);
        }

        private List<Vector3> getFreeNeighbors(Island island, Tile tile)
        {
            List<Vector3> positions = new List<Vector3>();

            for (float x = tile.Position.X - 1; x <= tile.Position.X + 1; x++)
            {
                for (float y = tile.Position.Y - 1; y <= tile.Position.Y + 1; y++)
                {
                    Tile neighbor = getTile(island, new Vector3(x, y, tile.Position.Z));
                    if (neighbor == null)
                    {
                        positions.Add(new Vector3(x, y, tile.Position.Z));
                    }
                }
            }

            return positions;
        }

        private Tile getTile(Island island, Vector3 pos)
        {
            Biom biom = island.bioms.FirstOrDefault(b => b.tiles.Any(t => t.CheckIfSameTile(pos)));
            if (biom == null)
            {
                // tile not found
                return null;
            }

            List<Tile> biomTiles = biom.tiles;
            Debug.Assert(biom.tiles.Count >= 1);

            Tile tile = biomTiles.FirstOrDefault(t => t.CheckIfSameTile(pos));

            return tile;
        }

        private void CreateAndAddRndStartBioms(Island island)
        {
            Random rnd = new Random();
            int nof_bioms_in_island = rnd.Next((int)((island.size / 4) + 1), (int)((island.size / 3) + 1));
            do
            {
                int x = rnd.Next(0, island.size);
                int y = rnd.Next(0, island.size);
                Vector3 position = new Vector3((float)x, (float)y, island.StartPosition.Z);

                var tile_already_exits = false;
                foreach (Biom b in island.bioms)
                {
                    foreach (Tile t in b.tiles)
                    {
                        if(Vector3.DistanceSquared(t.Position, position) <= SettingsController.Instance.GetSettings().V1.Vector3EqualsAllowedDistanceDisturbance)
                        {
                            tile_already_exits = true;
                            break;
                        }
                    }
                }
                if(tile_already_exits == false)
                {
                    island.bioms.Add(biom_factory.GetRndBiomAtStartPosition(position));
                    nof_bioms_in_island--;
                }
            } while (nof_bioms_in_island > 0);
        }

        private void ExpandBiomsAndCreateTiles(Island island)
        {
            int biomRadius = 1;
            do
            {
                foreach(Biom b in island.bioms)
                {
                    for(int yLoopCount = ((int) b.tiles.First().Position.Y - biomRadius); yLoopCount <= (int) b.tiles.First().Position.Y + biomRadius; yLoopCount++)
                    {
                        if((yLoopCount >= island.StartPosition.Y) && (yLoopCount < island.StartPosition.Y + island.size))
                        {
                            for (int xLoopCount = ((int)b.tiles.First().Position.X - biomRadius); xLoopCount <= (int)b.tiles.First().Position.X + biomRadius; xLoopCount++)
                            {
                                if ((xLoopCount >= island.StartPosition.X) && (xLoopCount < island.StartPosition.X + island.size))
                                {
                                    var tile_already_exits = false;
                                    Vector3 newTilePosition = new Vector3(xLoopCount, yLoopCount, island.StartPosition.Z);

                                    foreach (Tile t in island.Tiles)
                                    {
                                        if (Vector3.DistanceSquared(t.Position, newTilePosition) <= SettingsController.Instance.GetSettings().V1.Vector3EqualsAllowedDistanceDisturbance)
                                        {
                                            tile_already_exits = true;
                                            break;
                                        }
                                    }

                                    if (tile_already_exits == false)
                                    {
                                        b.AddRndBiomTileAtPosition(newTilePosition);
                                    }
                                }
                            }
                        }
                    }
                }
                biomRadius++;
            } while (island.Tiles.Count < (island.size * island.size));
        }

        private string GenerateRandomName()
        {
            string RandomName = "Refugium";

            return RandomName;
        }
    }
}