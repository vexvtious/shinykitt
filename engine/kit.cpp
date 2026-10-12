/*
 * shinykitt engine bindings — a thin JSON-in / JSON-out layer over PokéFinder's Core.
 * PokéFinder Core: Copyright (C) 2017-2024 Admiral_Fish, bumba, EzPzStreamz — GPL-3.0-or-later.
 * This file is part of shinykitt and is likewise licensed under the GNU GPL v3 (see LICENSE).
 *
 * Every call takes one JSON object and returns one JSON object, so the same code powers
 * the browser (WebAssembly, see wasm.cpp) and the command line (see cli.cpp).
 */
#include "kit.hpp"

// GameCubeSearcher only exposes a threaded entry point; WebAssembly here has no threads,
// so we call its search() directly. Standard headers first so the access tweak can't touch them.
#include <array>
#include <atomic>
#include <mutex>
#include <thread>
#include <vector>
#include <Core/Gen3/StaticTemplate3.hpp>
#include <Core/Parents/Searchers/SearcherBase.hpp>
#include <Core/Parents/Searchers/StaticSearcher.hpp>
#define private public
#include <Core/Gen3/Searchers/GameCubeSearcher.hpp>
#undef private
#include <Core/Gen3/Generators/GameCubeGenerator.hpp>
#include <Core/RNG/LCRNG.hpp>

#include <Core/Enum/Game.hpp>
#include <Core/Enum/Lead.hpp>
#include <Core/Enum/Method.hpp>
#include <Core/Gen3/Encounters3.hpp>
#include <Core/Gen3/Generators/StaticGenerator3.hpp>
#include <Core/Gen3/Generators/WildGenerator3.hpp>
#include <Core/Gen3/EncounterArea3.hpp>
#include <Core/Parents/States/WildState.hpp>
#include <Core/Enum/Encounter.hpp>
#include <Core/Enum/Item.hpp>
#include <algorithm>
#include <set>
#include <map>
#include <Core/Gen3/Profile3.hpp>
#include <Core/Gen3/StaticTemplate3.hpp>
#include <Core/Gen4/Encounters4.hpp>
#include <Core/Gen4/Generators/StaticGenerator4.hpp>
#include <Core/Gen4/Profile4.hpp>
#include <Core/Gen4/SeedTime4.hpp>
#include <Core/Gen4/StaticTemplate4.hpp>
#include <Core/Gen4/States/State4.hpp>
#include <Core/Gen4/Tools/SeedToTimeCalculator4.hpp>
#include <Core/Parents/Filters/StateFilter.hpp>
#include <Core/Parents/States/IVToPIDState.hpp>
#include <Core/Parents/States/State.hpp>
#include <Core/Util/DateTime.hpp>
#include <Core/Util/IVToPIDCalculator.hpp>
#include <Core/Util/Translator.hpp>
#include <nlohmann/json.hpp>

#include <cstdio>
#include <string>

using json = nlohmann::json;

namespace
{
    bool translatorReady = false;
    void ensureTranslator()
    {
        if (!translatorReady)
        {
            Translator::init("en");
            translatorReady = true;
        }
    }

    Game gameFrom(const std::string &g)
    {
        if (g == "emerald") return Game::Emerald;
        if (g == "ruby") return Game::Ruby;
        if (g == "sapphire") return Game::Sapphire;
        if (g == "firered") return Game::FireRed;
        if (g == "leafgreen") return Game::LeafGreen;
        if (g == "diamond") return Game::Diamond;
        if (g == "pearl") return Game::Pearl;
        if (g == "platinum") return Game::Platinum;
        if (g == "heartgold") return Game::HeartGold;
        if (g == "soulsilver") return Game::SoulSilver;
        throw std::runtime_error("Unknown game: " + g);
    }

    bool isGen3(Game g) { return (g & Game::Gen3) != Game::None; }

    const char *methodName(Method m)
    {
        switch (m)
        {
        case Method::Method1: return "Method 1";
        case Method::Method1Reverse: return "Method 1 Reverse";
        case Method::Method2: return "Method 2";
        case Method::Method4: return "Method 4";
        case Method::MethodJ: return "Method J";
        case Method::MethodK: return "Method K";
        default: return "Other";
        }
    }

    Method methodFrom(const std::string &m, Method fallback)
    {
        if (m.empty()) return fallback;
        if (m == "method1") return Method::Method1;
        if (m == "method2") return Method::Method2;
        if (m == "method4") return Method::Method4;
        if (m == "methodj") return Method::MethodJ;
        if (m == "methodk") return Method::MethodK;
        throw std::runtime_error("Unknown method: " + m);
    }

    std::array<u8, 6> ivArray(const json &j, const char *key, u8 fill)
    {
        std::array<u8, 6> out;
        out.fill(fill);
        if (j.contains(key) && j[key].is_array())
        {
            for (size_t i = 0; i < 6 && i < j[key].size(); i++) out[i] = j[key][i].get<u8>();
        }
        return out;
    }

    StateFilter makeFilter(const json &q)
    {
        auto min = ivArray(q, "ivMin", 0);
        auto max = ivArray(q, "ivMax", 31);
        std::array<bool, 25> natures;
        natures.fill(true);
        if (q.contains("natures") && q["natures"].is_array() && !q["natures"].empty())
        {
            natures.fill(false);
            for (auto &n : q["natures"]) natures[n.get<int>()] = true;
        }
        std::array<bool, 16> powers;
        powers.fill(true);
        u8 shiny = q.value("shinyOnly", false) ? 3 : 255;
        u8 gender = q.value("gender", 255);
        return StateFilter(gender, 255, shiny, 1, 100, 0, 255, 0, 255, false, min, max, natures, powers);
    }

    template <class S> json stateJson(const S &s)
    {
        ensureTranslator();
        char pid[11];
        std::snprintf(pid, sizeof(pid), "%08X", s.getPID());
        auto iv = s.getIVs();
        json out{ { "pid", pid },
                     { "shiny", s.getShiny() },
                     { "nature", Translator::getNature(s.getNature()) },
                     { "natureId", s.getNature() },
                     { "ability", s.getAbility() },
                     { "gender", s.getGender() },
                     { "ivs", std::vector<int>(iv.begin(), iv.end()) },
                     { "hiddenPower", Translator::getHiddenPower(s.getHiddenPower()) },
                     { "hpPower", s.getHiddenPowerStrength() },
                     { "level", s.getLevel() } };
        if constexpr (requires { s.getAdvances(); }) out["advances"] = s.getAdvances();
        return out;
    }

    json state4Json(const GeneratorState4 &s)
    {
        json j = stateJson(s);
        static const char *calls[] = { "E", "K", "P" };
        j["chatot"] = s.getChatot(); // Chatot pitch 0-99 (DPPt)
        j["call"] = calls[s.getCall()]; // Elm/Irwin call (HGSS)
        return j;
    }

    // ------------------------------------------------------------------ Gen 3 wild
    struct EncName { Encounter e; const char *key; const char *label; };
    const EncName ENCOUNTERS3[] = { { Encounter::Grass, "grass", "Grass / cave" }, { Encounter::Surfing, "surfing", "Surfing" },
                                    { Encounter::OldRod, "oldrod", "Old Rod" }, { Encounter::GoodRod, "goodrod", "Good Rod" },
                                    { Encounter::SuperRod, "superrod", "Super Rod" }, { Encounter::RockSmash, "rocksmash", "Rock Smash" } };
    Encounter encounterFrom(const std::string &k)
    {
        for (auto &e : ENCOUNTERS3) if (k == e.key) return e.e;
        throw std::runtime_error("Unknown encounter type: " + k);
    }

    std::vector<EncounterArea3> areas3(Game game, Encounter enc, bool feebas)
    {
        EncounterSettings3 settings{ feebas };
        return Encounters3::getEncounters(enc, settings, game);
    }

    // Every species you can meet in the wild in this game, with where.
    json wild3Species(const json &q)
    {
        ensureTranslator();
        Game game = gameFrom(q.at("game"));
        std::map<u16, json> bySpecies;
        for (auto &e : ENCOUNTERS3)
        {
            for (bool feebas : { false, true })
            {
                if (feebas && !(e.e == Encounter::OldRod || e.e == Encounter::GoodRod || e.e == Encounter::SuperRod)) continue;
                auto list = areas3(game, e.e, feebas);
                for (auto &a : list)
                {
                    auto names = Translator::getLocations({ a.getLocation() }, game);
                    for (u16 sp : a.getUniqueSpecies())
                    {
                        auto &j = bySpecies[sp];
                        if (j.is_null()) j = json{ { "species", sp }, { "name", Translator::getSpecie(sp) }, { "areas", json::array() } };
                        json area{ { "encounter", e.key }, { "encounterName", e.label }, { "location", a.getLocation() },
                                   { "locationName", names.empty() ? "?" : names[0] }, { "feebasTile", feebas } };
                        bool dup = false;
                        for (auto &x : j["areas"]) if (x == area) dup = true;
                        // Feebas-tile areas only matter for Feebas itself
                        if (feebas && sp != 349) continue;
                        if (!dup) j["areas"].push_back(area);
                    }
                }
            }
        }
        json out = json::array();
        for (auto &[sp, j] : bySpecies) if (!j["areas"].empty()) out.push_back(j);
        return { { "species", out } };
    }

    json gen3Wild(const json &q)
    {
        ensureTranslator();
        Game game = gameFrom(q.at("game"));
        u32 seed = q.contains("seed") ? q["seed"].get<u32>() : (game == Game::Emerald ? 0 : 0x5A0);
        Profile3 profile("kit", game, q.at("tid").get<u16>(), q.at("sid").get<u16>(), q.value("deadBattery", game != Game::Emerald));
        Encounter enc = encounterFrom(q.at("encounter"));
        bool feebas = q.value("feebasTile", false);
        auto list = areas3(game, enc, feebas);
        int loc = q.at("location").get<int>();
        auto area = std::find_if(list.begin(), list.end(), [loc](const auto &a) { return a.getLocation() == loc; });
        if (area == list.end()) throw std::runtime_error("That location has no encounters of this type");
        u16 species = q.value("species", 0);
        StackVector<bool, 13> slots;
        if (species)
        {
            auto v = area->getSlots(species);
            for (bool b : v) slots.push_back(b);
        }
        else
        {
            for (int i = 0; i < 12; i++) slots.push_back(true);
        }
        auto min = ivArray(q, "ivMin", 0), max = ivArray(q, "ivMax", 31);
        std::array<bool, 25> natures;
        natures.fill(true);
        if (q.contains("natures") && q["natures"].is_array() && !q["natures"].empty())
        {
            natures.fill(false);
            for (auto &n : q["natures"]) natures[n.get<int>()] = true;
        }
        std::array<bool, 16> powers;
        powers.fill(true);
        WildStateFilter filter(q.value("gender", 255), 255, q.value("shinyOnly", false) ? 3 : 255, 1, 100, 0, 255, 0, 255, false, min, max, natures, powers, slots);
        Lead lead = static_cast<Lead>(q.value("lead", 255));
        u32 initial = q.value("initialAdvances", 0u), maxAdv = q.value("maxAdvances", 100000u);
        std::vector<Method> methods;
        if (q.contains("methods")) { for (auto &m : q["methods"]) methods.push_back(methodFrom(m.get<std::string>(), Method::Method1)); }
        else methods = { Method::Method1 };
        size_t limit = q.value("limit", 200u);
        std::vector<std::pair<Method, WildGeneratorState>> all;
        for (Method m : methods)
        {
            WildGenerator3 gen(initial, maxAdv, 0, m, lead, feebas, Item::None, *area, profile, filter);
            for (auto &st : gen.generate(seed)) all.emplace_back(m, st);
        }
        std::stable_sort(all.begin(), all.end(), [](auto &a, auto &b) { return a.second.getAdvances() < b.second.getAdvances(); });
        json out = json::array();
        for (size_t i = 0; i < all.size() && i < limit; i++)
        {
            auto &[m, st] = all[i];
            json j = stateJson(st);
            j["method"] = methodName(m);
            j["slot"] = st.getEncounterSlot();
            j["species"] = st.getSpecie();
            j["speciesName"] = Translator::getSpecie(st.getSpecie());
            out.push_back(j);
        }
        return { { "seed", seed }, { "count", all.size() }, { "results", out } };
    }

    // ------------------------------------------------------------------ Gen 4: which delay/second did I actually hit?
    json gen4Hit(const json &q)
    {
        Game game = gameFrom(q.at("game"));
        Profile4 profile("kit", game, q.at("tid").get<u16>(), q.at("sid").get<u16>(), false);
        const StaticTemplate4 *t = Encounters4::getStaticEncounter(q.at("category"), q.at("index"));
        Method method = methodFrom(q.value("method", ""), t->getMethod());
        Lead lead = static_cast<Lead>(q.value("lead", 255));
        u32 target = std::stoul(q.at("seed").get<std::string>(), nullptr, 16);
        int delayRange = q.value("delayRange", 100), secondRange = q.value("secondRange", 1);
        StaticGenerator4 gen(0, q.value("maxAdvances", 30u), 0, method, lead, *t, profile, makeFilter(q));
        u32 ab = target >> 24, cd = (target >> 16) & 0xFF, efgh = target & 0xFFFF;
        json out = json::array();
        for (int ds = -secondRange; ds <= secondRange; ds++)
        {
            for (int dd = -delayRange; dd <= delayRange; dd++)
            {
                int e = (int)efgh + dd;
                if (e < 0 || e > 0xFFFF) continue;
                u32 seed = (((ab + ds) & 0xFF) << 24) | (cd << 16) | (u32)e;
                for (auto &s : gen.generate(seed))
                {
                    json j = state4Json(s);
                    char hex[9];
                    std::snprintf(hex, sizeof(hex), "%08X", seed);
                    j["seed"] = hex;
                    j["delayOff"] = dd;
                    j["secondOff"] = ds;
                    out.push_back(j);
                }
            }
        }
        std::stable_sort(out.begin(), out.end(), [](const json &a, const json &b) {
            return std::abs(a["delayOff"].get<int>()) + 60 * std::abs(a["secondOff"].get<int>()) < std::abs(b["delayOff"].get<int>()) + 60 * std::abs(b["secondOff"].get<int>());
        });
        if (out.size() > 50) out.erase(out.begin() + 50, out.end());
        return { { "results", out } };
    }

    // ------------------------------------------------------------------ Channel Jirachi (Pokémon Channel event, OT CHANNEL / 40122)
    json channelJirachi(const json &q)
    {
        ensureTranslator();
        auto min = ivArray(q, "ivMin", 0), max = ivArray(q, "ivMax", 31);
        u64 combos = 1;
        for (int i = 0; i < 6; i++) combos *= (max[i] >= min[i] ? max[i] - min[i] + 1 : 0);
        if (combos > 20000000ull) throw std::runtime_error("Narrow the IV ranges (too many combinations to search on a phone)");
        Profile3 profile("kit", Game::GC, 40122, 0, false);
        StateFilter filter = makeFilter(q);
        const StaticTemplate3 *t = Encounters3::getStaticEncounter(9, 0);
        GameCubeSearcher searcher(Method::Channel, false, profile, filter);
        searcher.search(min, max, t);
        auto states = searcher.getResults();
        std::sort(states.begin(), states.end(), [](const auto &a, const auto &b) { return a.getSeed() < b.getSeed(); });
        size_t limit = q.value("limit", 200u);
        json out = json::array();
        size_t matched = 0;
        for (size_t i = 0; i < states.size(); i++)
        {
            const auto &st = states[i];
            // Replay the Channel sequence from this seed to read the trainer details PKHeX checks.
            XDRNG go(st.getSeed());
            for (u8 mask = 0; mask < 14;) mask |= 1 << (go.nextUShort() >> 14);
            go.advance(4);
            // Same order as PokeFinder's generator: the second threshold is only read if the first fails
            bool pattern = go.nextUShort() <= 0x4000 || go.nextUShort() <= 0x547a;
            if (pattern) go.advance(1); else go.advance(2);
            u16 sid = go.nextUShort();
            u16 high = go.nextUShort(), low = go.nextUShort();
            if (40122 ^ sid ^ high ^ (low < 8 ? 1 : 0)) high ^= 0x8000; // the game's "not shiny" check binds as tid^sid^high^(low<8), so it almost always flips the top bit
            bool consistent = ((static_cast<u32>(high) << 16) | low) == st.getPID();
            u16 berry = go.nextUShort() >> 13, version = go.nextUShort() >> 12, gender = go.nextUShort() >> 11;
            json j = stateJson(st);
            char hex[9];
            std::snprintf(hex, sizeof(hex), "%08X", st.getSeed());
            j["seed"] = hex;
            j["sid"] = sid;
            j["tid"] = 40122;
            j["game"] = version >= 8 ? "Ruby" : "Sapphire";
            j["otGender"] = gender >= 16 ? "Female" : "Male";
            j["berry"] = berry >= 4 ? "Salac" : "Ganlon";
            if (!consistent) continue; // never hand out a spread whose details we can't reproduce
            matched++;
            if (out.size() < limit) out.push_back(j);
        }
        return { { "count", matched }, { "results", out } };
    }

    // ------------------------------------------------------------------ catalogue
    json listStatic(const json &q)
    {
        ensureTranslator();
        Game game = gameFrom(q.at("game"));
        static const char *names[] = { "Starters", "Fossils", "Gifts", "Game Corner", "Stationary", "Legends", "Events", "Roamers" };
        json cats = json::array();
        for (int type = 0; type < 8; type++)
        {
            json mons = json::array();
            int size = 0;
            if (isGen3(game))
            {
                const StaticTemplate3 *t = Encounters3::getStaticEncounters(type, &size);
                for (int i = 0; i < size; i++)
                    if ((t[i].getVersion() & game) != Game::None)
                        mons.push_back({ { "index", i }, { "species", t[i].getSpecie() }, { "name", Translator::getSpecie(t[i].getSpecie()) },
                                         { "level", t[i].getLevel() }, { "shinyLocked", t[i].getShiny() == Shiny::Never } });
            }
            else
            {
                const StaticTemplate4 *t = Encounters4::getStaticEncounters(type, &size);
                for (int i = 0; i < size; i++)
                    if ((t[i].getVersion() & game) != Game::None)
                        mons.push_back({ { "index", i }, { "species", t[i].getSpecie() }, { "name", Translator::getSpecie(t[i].getSpecie()) },
                                         { "level", t[i].getLevel() }, { "method", methodName(t[i].getMethod()) },
                                         { "shinyLocked", t[i].getShiny() == Shiny::Never } });
            }
            if (!mons.empty()) cats.push_back({ { "category", type }, { "name", names[type] }, { "pokemon", mons } });
        }
        return { { "categories", cats } };
    }

    // ------------------------------------------------------------------ Gen 3 static (fixed seed: Emerald 0, dead-battery R/S 0x5A0)
    json gen3Static(const json &q)
    {
        Game game = gameFrom(q.at("game"));
        if (!isGen3(game)) throw std::runtime_error("gen3Static needs a Gen 3 game");
        u32 seed = q.contains("seed") ? q["seed"].get<u32>() : (game == Game::Emerald ? 0 : 0x5A0);
        Profile3 profile("kit", game, q.at("tid").get<u16>(), q.at("sid").get<u16>(), q.value("deadBattery", game != Game::Emerald));
        const StaticTemplate3 *t = Encounters3::getStaticEncounter(q.at("category"), q.at("index"));
        Method method = methodFrom(q.value("method", ""), Method::Method1);
        u32 initial = q.value("initialAdvances", 0u), max = q.value("maxAdvances", 100000u), offset = q.value("offset", 0u);
        StaticGenerator3 gen(initial, max, offset, method, *t, profile, makeFilter(q));
        auto states = gen.generate(seed);
        size_t limit = q.value("limit", 200u);
        json out = json::array();
        for (size_t i = 0; i < states.size() && i < limit; i++) out.push_back(stateJson(states[i]));
        return { { "seed", seed }, { "count", states.size() }, { "results", out } };
    }

    // ------------------------------------------------------------------ Gen 4 static: generate from a seed
    json gen4Static(const json &q)
    {
        Game game = gameFrom(q.at("game"));
        Profile4 profile("kit", game, q.at("tid").get<u16>(), q.at("sid").get<u16>(), false);
        const StaticTemplate4 *t = Encounters4::getStaticEncounter(q.at("category"), q.at("index"));
        Method method = methodFrom(q.value("method", ""), t->getMethod());
        Lead lead = static_cast<Lead>(q.value("lead", 255));
        u32 seed = std::stoul(q.at("seed").get<std::string>(), nullptr, 16);
        StaticGenerator4 gen(q.value("initialAdvances", 0u), q.value("maxAdvances", 1000u), 0, method, lead, *t, profile, makeFilter(q));
        auto states = gen.generate(seed);
        json out = json::array();
        for (size_t i = 0; i < states.size() && i < 200; i++) out.push_back(state4Json(states[i]));
        return { { "count", states.size() }, { "results", out } };
    }

    // ------------------------------------------------------------------ Gen 4 static: search seeds reachable on retail (AB/CD/EFGH)
    json gen4Search(const json &q)
    {
        Game game = gameFrom(q.at("game"));
        Profile4 profile("kit", game, q.at("tid").get<u16>(), q.at("sid").get<u16>(), false);
        const StaticTemplate4 *t = Encounters4::getStaticEncounter(q.at("category"), q.at("index"));
        Method method = methodFrom(q.value("method", ""), t->getMethod());
        Lead lead = static_cast<Lead>(q.value("lead", 255));
        u16 year = q.value("year", 2000);
        u32 minDelay = q.value("minDelay", 600u), maxDelay = q.value("maxDelay", 1100u);
        u32 minAdv = q.value("minAdvances", 0u), maxAdv = q.value("maxAdvances", 20u);
        u32 hourMin = q.value("hourMin", 0u), hourMax = q.value("hourMax", 23u);
        size_t limit = q.value("limit", 300u);
        StateFilter filter = makeFilter(q);
        StaticGenerator4 gen(minAdv, maxAdv - minAdv, 0, method, lead, *t, profile, filter);

        json out = json::array();
        size_t total = 0;
        u32 yearOffset = year - 2000;
        bool stopAtLimit = q.value("stopAtLimit", true);
        for (u32 delay = minDelay; delay <= maxDelay && !(stopAtLimit && out.size() >= limit); delay++)
        {
            for (u32 hour = hourMin; hour <= hourMax; hour++)
            {
                for (u32 ab = 0; ab < 256; ab++)
                {
                    u32 seed = (ab << 24) | (hour << 16) | ((delay + yearOffset) & 0xFFFF);
                    auto states = gen.generate(seed);
                    for (auto &s : states)
                    {
                        total++;
                        if (out.size() < limit)
                        {
                            json j = state4Json(s);
                            char hex[9];
                            std::snprintf(hex, sizeof(hex), "%08X", seed);
                            j["seed"] = hex;
                            j["delay"] = delay;
                            j["hour"] = hour;
                            out.push_back(j);
                        }
                    }
                }
            }
        }
        return { { "method", methodName(method) }, { "count", total }, { "complete", !(stopAtLimit && out.size() >= limit) }, { "results", out } };
    }

    // ------------------------------------------------------------------ Gen 4: seed -> boot date/time + delay
    json gen4SeedTimes(const json &q)
    {
        u32 seed = std::stoul(q.at("seed").get<std::string>(), nullptr, 16);
        u16 year = q.value("year", 2000);
        bool force = q.contains("second");
        u8 second = q.value("second", 0);
        auto times = SeedToTimeCalculator4::calculateTimes(seed, year, force, second);
        json out = json::array();
        size_t limit = q.value("limit", 60u);
        for (size_t i = 0; i < times.size() && i < limit; i++)
        {
            auto dt = times[i].getDateTime();
            out.push_back({ { "date", dt.getDate().toString() }, { "time", dt.getTime().toString() }, { "delay", times[i].getDelay() } });
        }
        return { { "count", times.size() }, { "results", out } };
    }

    // ------------------------------------------------------------------ SID from a Pokémon you already caught (IVs + nature + TID)
    json findSID(const json &q)
    {
        auto iv = ivArray(q, "ivs", 0);
        auto states = IVToPIDCalculator::calculatePIDs(iv[0], iv[1], iv[2], iv[3], iv[4], iv[5], q.at("nature").get<u8>(), q.at("tid").get<u16>());
        bool shiny = q.value("isShiny", true);
        u16 tid = q.at("tid").get<u16>();
        json out = json::array();
        for (auto &s : states)
        {
            char pid[9];
            std::snprintf(pid, sizeof(pid), "%08X", s.getPID());
            json row{ { "pid", pid }, { "method", methodName(s.getMethod()) }, { "sidHint", s.getSID() } };
            if (shiny)
            {
                // Every SID that would make this PID shiny for your TID (8 candidates per PID).
                u16 psv = (s.getPID() >> 16) ^ (s.getPID() & 0xFFFF) ^ tid;
                json sids = json::array();
                for (u16 low = 0; low < 8; low++) sids.push_back(static_cast<u16>((psv & 0xFFF8) | low));
                row["sids"] = sids;
            }
            out.push_back(row);
        }
        return { { "results", out } };
    }
}

std::string kitCall(const std::string &fn, const std::string &input)
{
    try
    {
        json q = input.empty() ? json::object() : json::parse(input);
        json r;
        if (fn == "listStatic") r = listStatic(q);
        else if (fn == "gen3Static") r = gen3Static(q);
        else if (fn == "gen4Static") r = gen4Static(q);
        else if (fn == "gen4Search") r = gen4Search(q);
        else if (fn == "gen4SeedTimes") r = gen4SeedTimes(q);
        else if (fn == "findSID") r = findSID(q);
        else if (fn == "wild3Species") r = wild3Species(q);
        else if (fn == "gen3Wild") r = gen3Wild(q);
        else if (fn == "gen4Hit") r = gen4Hit(q);
        else if (fn == "channelJirachi") r = channelJirachi(q);
        else if (fn == "version") r = json{ { "engine", "PokeFinder Core 4.4.1" }, { "kit", "0.4.0" } };
        else throw std::runtime_error("Unknown function: " + fn);
        r["ok"] = true;
        return r.dump();
    }
    catch (const std::exception &e)
    {
        return json{ { "ok", false }, { "error", e.what() } }.dump();
    }
}
