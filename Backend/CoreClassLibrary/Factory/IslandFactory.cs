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

            island.name = GenerateRandomName();
            if(size < 2)
            {
                size = 2;
            }
            island.size = size;

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
                List<Vector3> freeNeighbors = island.getFreeNeighbors(tile);

                foreach (Vector3 pos in freeNeighbors)
                {
                    var newTile = CreateNewEdgeTile(island, tile, pos);

                    if (newTile != null)
                    {
                        tiles.Add(newTile);
                    }
                }
            }
            biom.tiles.AddRange(tiles);
            island.bioms.Add(biom);
        }

        private Tile CreateNewEdgeTile(Island island, Tile tile, Vector3 pos)
        {
            List<Tile> neighbors = island.getNeighbors(pos);

            Tile newTile = null;
            Tile.eOrientation orientation = Tile.eOrientation.North;
            // set typ depending on neighbors
            int count = neighbors.Count(t => !(t is EdgeTile));
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
                    // check 4 relevant tiles for side
                    if (island.getTile(pos - new Vector3(+1, +1, 0)) != null)
                    {
                        orientation = Tile.eOrientation.South;
                    }
                    else if (island.getTile(pos - new Vector3(-1, -1, 0)) != null)
                    {
                        orientation = Tile.eOrientation.North;
                    }
                    else if (island.getTile(pos - new Vector3(+1, -1, 0)) != null)
                    {
                        orientation = Tile.eOrientation.West;
                    }
                    else if (island.getTile(pos - new Vector3(-1, +1, 0)) != null)
                    {
                        orientation = Tile.eOrientation.East;
                    }

                    newTile = new QuarterEdgeTile(pos, orientation);
                    break;
                case 2:
                case 3:
                    // check 4 relevant tiles for side
                    if (island.getTile(pos - new Vector3(0, +1, 0)) != null)
                    {
                        orientation = Tile.eOrientation.South;
                    }
                    else if (island.getTile(pos - new Vector3(0, -1, 0)) != null)
                    {
                        orientation = Tile.eOrientation.North;
                    }
                    else if (island.getTile(pos - new Vector3(+1, 0, 0)) != null)
                    {
                        orientation = Tile.eOrientation.West;
                    }
                    else if (island.getTile(pos - new Vector3(-1, 0, 0)) != null)
                    {
                        orientation = Tile.eOrientation.East;
                    }

                    newTile = new HalfEdgeTile(pos, orientation);
                    break;
                case 5:
                    // check 4 relevant tiles for side
                    if (island.getTile(pos - new Vector3(+1, +1, 0)) == null)
                    {
                        orientation = Tile.eOrientation.South;
                    }
                    else if (island.getTile(pos - new Vector3(-1, -1, 0)) == null)
                    {
                        orientation = Tile.eOrientation.North;
                    }
                    else if (island.getTile(pos - new Vector3(+1, -1, 0)) == null)
                    {
                        orientation = Tile.eOrientation.West;
                    }
                    else if (island.getTile(pos - new Vector3(-1, +1, 0)) == null)
                    {
                        orientation = Tile.eOrientation.East;
                    }

                    newTile = new TriQuarterEdgeTile(pos);
                    break;
            }

            return newTile;
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