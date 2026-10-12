// shinykitt command line: ./kit <function> '<json>'   (GPL-3.0)
#include "kit.hpp"
#include <iostream>
int main(int argc, char **argv)
{
    if (argc < 2) { std::cerr << "usage: kit <function> '<json>'\n"; return 2; }
    std::cout << kitCall(argv[1], argc > 2 ? argv[2] : "{}") << "\n";
    return 0;
}
